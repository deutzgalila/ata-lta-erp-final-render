#!/usr/bin/env node

/**
 * Cutover Backfill Script: Legacy Status to Phase Model Promotion
 *
 * Promotes legacy work request statuses to the 4-phase model
 * (pre_processing, processing, quality_assurance, completion)
 * and sets task phase inheritance with clamping.
 *
 * Frozen Decision D6 Mapping:
 * - Draft, Pre-processing               -> pre_processing (on_hold = false)
 * - In Progress, Processing              -> processing (on_hold = false)
 * - For Review, Quality Assurance       -> quality_assurance (on_hold = false)
 * - Billing, Disbursement, Completed    -> completion (on_hold = false)
 * - Cancelled                           -> phase remains NULL (terminal)
 * - On Hold                             -> recovered pre-hold status (on_hold = true),
 *                                          else fallback to pre_processing
 *
 * Task Inheritance:
 * - pre_processing WR -> task phase = pre_processing
 * - processing WR     -> task phase = processing
 * - quality_assurance WR -> task phase clamped to processing
 * - completion WR     -> task phase clamped to processing
 * - Cancelled WR      -> task phase remains NULL
 *
 * Usage:
 *   node backend/scripts/backfill-phases.js [options]
 *
 * Options:
 *   --dry-run             Preview execution without writing changes (default)
 *   --apply               Commit changes inside an atomic transaction
 *   --env <env>           Environment (local, staging, prod) [default: local]
 *   --report <path>       Report output path [default: ./backfill-report.json]
 *   --confirm-remote      Required if targeting staging or prod
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Static status mapping matrix (Frozen Decision D6)
const STATUS_TO_PHASE_MAP = {
  Draft: { phase: 'pre_processing', on_hold: false },
  'Pre-processing': { phase: 'pre_processing', on_hold: false },
  'In Progress': { phase: 'processing', on_hold: false },
  Processing: { phase: 'processing', on_hold: false },
  'For Review': { phase: 'quality_assurance', on_hold: false },
  'Quality Assurance': { phase: 'quality_assurance', on_hold: false },
  Billing: { phase: 'completion', on_hold: false },
  Disbursement: { phase: 'completion', on_hold: false },
  Completed: { phase: 'completion', on_hold: false },
  Cancelled: { phase: null, on_hold: false, skip: true },
};

/**
 * Clamp WR phase to task-compatible phase.
 * Tasks only accept 'pre_processing' or 'processing'.
 *
 * @param {string|null} wrPhase
 * @returns {string|null}
 */
function clampTaskPhase(wrPhase) {
  if (!wrPhase) return null;
  if (wrPhase === 'pre_processing') return 'pre_processing';
  return 'processing';
}

/**
 * Determine the mapped phase and on_hold flag for a work request.
 *
 * @param {string} status - Legacy status
 * @param {string|null} priorStatus - Recovered status if On Hold
 * @returns {{ phase: string|null, on_hold: boolean, ambiguous?: boolean }}
 */
function mapStatusToPhase(status, priorStatus = null) {
  if (status === 'Cancelled') {
    return { phase: null, on_hold: false, skip: true };
  }

  if (status === 'On Hold') {
    if (priorStatus && STATUS_TO_PHASE_MAP[priorStatus] && STATUS_TO_PHASE_MAP[priorStatus].phase) {
      return {
        phase: STATUS_TO_PHASE_MAP[priorStatus].phase,
        on_hold: true,
        recovered: true,
        priorStatus,
      };
    }
    // Ambiguous On Hold row with no recoverable prior status
    return {
      phase: 'pre_processing',
      on_hold: true,
      ambiguous: true,
    };
  }

  const mapping = STATUS_TO_PHASE_MAP[status];
  if (mapping) {
    return {
      phase: mapping.phase,
      on_hold: mapping.on_hold,
    };
  }

  // Fallback for unknown status
  return {
    phase: 'pre_processing',
    on_hold: false,
    unknownStatus: true,
  };
}

/**
 * Query historical audit logs or status history to recover the last
 * non-hold status for an On Hold work request.
 *
 * @param {object} client - pg Client
 * @param {string} workRequestId - WR UUID
 * @returns {Promise<string|null>}
 */
async function recoverPriorStatus(client, workRequestId) {
  // 1. Try status_history table first
  try {
    const historyRes = await client.query(
      `SELECT old_status FROM status_history
       WHERE table_name = 'work_requests'
         AND record_id = $1
         AND old_status IS NOT NULL
         AND old_status != 'On Hold'
       ORDER BY created_at DESC
       LIMIT 1`,
      [workRequestId]
    );
    if (historyRes.rows.length > 0 && historyRes.rows[0].old_status) {
      return historyRes.rows[0].old_status;
    }
  } catch (err) {
    // status_history may not exist in some environments or tables
  }

  // 2. Try audit_logs table
  try {
    const auditRes = await client.query(
      `SELECT details FROM audit_logs
       WHERE table_name = 'work_requests'
         AND record_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [workRequestId]
    );

    for (const row of auditRes.rows) {
      const details = row.details;
      if (!details) continue;

      const candidate =
        details.old_status ||
        details.previous_status ||
        (details.previous && details.previous.status) ||
        (details.old_values && details.old_values.status);

      if (candidate && candidate !== 'On Hold') {
        return candidate;
      }
    }
  } catch (err) {
    // audit_logs query error suppressed
  }

  return null;
}

/**
 * Parse command line arguments.
 */
function parseArgs(args = process.argv.slice(2)) {
  const options = {
    dryRun: true,
    apply: false,
    env: 'local',
    report: './backfill-report.json',
    confirmRemote: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
      options.apply = false;
    } else if (arg === '--apply') {
      options.apply = true;
      options.dryRun = false;
    } else if (arg === '--confirm-remote') {
      options.confirmRemote = true;
    } else if (arg === '--env' && args[i + 1]) {
      options.env = args[++i];
    } else if (arg === '--report' && args[i + 1]) {
      options.report = args[++i];
    }
  }

  return options;
}

/**
 * Main backfill execution function.
 *
 * @param {object} params
 * @param {object} params.client - pg Client instance
 * @param {boolean} params.apply - Whether to apply mutations
 * @param {string} params.env - Environment name
 * @param {string} params.reportPath - Report output path
 * @returns {Promise<object>} Report object
 */
async function runBackfill({ client, apply = false, env = 'local', reportPath = null }) {
  const mode = apply ? 'apply' : 'dry-run';
  const timestamp = new Date().toISOString();

  // Safety checks for remote environments: require an explicit operator
  // acknowledgement env flag for --apply against staging/prod.
  if ((env === 'staging' || env === 'prod' || env === 'production') && apply) {
    if (process.env.BACKFILL_REMOTE_ACK !== 'I_UNDERSTAND') {
      throw new Error(
        'Operational Safety Violation: remote backfill --apply requires BACKFILL_REMOTE_ACK=I_UNDERSTAND.'
      );
    }
  }

  // 1. Gather total counts for summary
  const totalScannedRes = await client.query(`SELECT count(*)::int AS count FROM work_requests`);
  const totalScanned = totalScannedRes.rows[0].count;

  const cancelledCountRes = await client.query(
    `SELECT count(*)::int AS count FROM work_requests WHERE status = 'Cancelled'`
  );
  const totalCancelledPreserved = cancelledCountRes.rows[0].count;

  // 2. Query unmapped active candidate rows (Idempotency Filter: phase IS NULL AND status != 'Cancelled')
  const candidateRes = await client.query(
    `SELECT id, title, status, phase, on_hold, client_id,
            entity_id,
            created_at, assigned_to
     FROM work_requests
     WHERE phase IS NULL
       AND status != 'Cancelled'
     ORDER BY created_at ASC`
  );
  const candidates = candidateRes.rows;

  const buckets = {
    pre_processing: { wr_count: 0, task_count: 0 },
    processing: { wr_count: 0, task_count: 0 },
    quality_assurance: { wr_count: 0, task_count: 0 },
    completion: { wr_count: 0, task_count: 0 },
    cancelled_preserved: { wr_count: totalCancelledPreserved, task_count: 0 },
    on_hold_recovered: { wr_count: 0, task_count: 0 },
    on_hold_unrecovered: { wr_count: 0, task_count: 0 },
  };

  const ambiguousInventory = [];
  const mappedRecords = [];
  const sqlPlan = [];

  let totalTasksMutated = 0;

  if (apply) {
    await client.query('BEGIN');
  }

  try {
    for (const wr of candidates) {
      let priorStatus = null;
      if (wr.status === 'On Hold') {
        priorStatus = await recoverPriorStatus(client, wr.id);
      }

      const mapping = mapStatusToPhase(wr.status, priorStatus);
      const targetPhase = mapping.phase;
      const targetOnHold = mapping.on_hold;
      const taskPhase = clampTaskPhase(targetPhase);

      // Track bucket metrics
      if (targetPhase && buckets[targetPhase]) {
        buckets[targetPhase].wr_count += 1;
      }
      if (wr.status === 'On Hold') {
        if (mapping.recovered) {
          buckets.on_hold_recovered.wr_count += 1;
        } else {
          buckets.on_hold_unrecovered.wr_count += 1;
        }
      }

      if (mapping.ambiguous) {
        ambiguousInventory.push({
          work_request_id: wr.id,
          entity_id: wr.entity_id || null,
          client_id: wr.client_id || null,
          title: wr.title,
          status: wr.status,
          created_at: wr.created_at,
          assigned_to: wr.assigned_to || null,
          defaulted_phase: 'pre_processing',
          reason: 'No status_history or audit_logs prior status found',
        });
      }

      // Count tasks for this WR that need phase updating
      const tasksCountRes = await client.query(
        `SELECT count(*)::int AS count
         FROM tasks
         WHERE work_request_id = $1
           AND phase IS NULL
           AND status != 'Cancelled'`,
        [wr.id]
      );
      const taskCount = tasksCountRes.rows[0].count;

      if (targetPhase && buckets[targetPhase]) {
        buckets[targetPhase].task_count += taskCount;
      }
      if (wr.status === 'On Hold') {
        if (mapping.recovered) {
          buckets.on_hold_recovered.task_count += taskCount;
        } else {
          buckets.on_hold_unrecovered.task_count += taskCount;
        }
      }

      totalTasksMutated += taskCount;

      mappedRecords.push({
        id: wr.id,
        legacy_status: wr.status,
        mapped_phase: targetPhase,
        on_hold: targetOnHold,
        tasks_updated: taskCount,
        recovered: Boolean(mapping.recovered),
        ambiguous: Boolean(mapping.ambiguous),
      });

      sqlPlan.push(
        `UPDATE work_requests SET phase = '${targetPhase}', on_hold = ${targetOnHold}, phase_entered_at = NOW() WHERE id = '${wr.id}';`
      );
      if (taskCount > 0 && taskPhase) {
        sqlPlan.push(
          `UPDATE tasks SET phase = '${taskPhase}' WHERE work_request_id = '${wr.id}' AND phase IS NULL AND status != 'Cancelled';`
        );
      }

      if (apply) {
        // Apply WR update
        await client.query(
          `UPDATE work_requests
           SET phase = $1,
               on_hold = $2,
               phase_entered_at = COALESCE(phase_entered_at, NOW())
           WHERE id = $3`,
          [targetPhase, targetOnHold, wr.id]
        );

        // Apply tasks update with clamping, preserving Cancelled tasks
        if (taskPhase) {
          await client.query(
            `UPDATE tasks
             SET phase = $1
             WHERE work_request_id = $2
               AND phase IS NULL
               AND status != 'Cancelled'`,
            [taskPhase, wr.id]
          );
        }
      }
    }

    if (apply) {
      await client.query('COMMIT');
    }
  } catch (err) {
    if (apply) {
      await client.query('ROLLBACK');
    }
    throw err;
  }

  const report = {
    timestamp,
    environment: env,
    mode,
    summary: {
      total_work_requests_scanned: totalScanned,
      total_work_requests_mutated: candidates.length,
      total_tasks_mutated: totalTasksMutated,
      total_cancelled_preserved: totalCancelledPreserved,
      total_ambiguous_on_hold: ambiguousInventory.length,
    },
    buckets,
    ambiguous_inventory: ambiguousInventory,
    mapped_records: mappedRecords,
    sql_plan_preview: sqlPlan.slice(0, 50),
  };

  if (reportPath) {
    const resolvedPath = path.resolve(reportPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, JSON.stringify(report, null, 2), 'utf8');
  }

  return report;
}

/**
 * Print execution summary to stdout.
 */
function printSummary(report) {
  /* eslint-disable no-console */
  console.log('====================================================');
  console.log(` Phase Model Backfill Execution Report (${report.mode.toUpperCase()})`);
  console.log('====================================================');
  console.log(`Environment:                  ${report.environment}`);
  console.log(`Timestamp:                    ${report.timestamp}`);
  console.log(`Total WRs Scanned:            ${report.summary.total_work_requests_scanned}`);
  console.log(`Total WRs Mutated:            ${report.summary.total_work_requests_mutated}`);
  console.log(`Total Tasks Mutated:          ${report.summary.total_tasks_mutated}`);
  console.log(`Total Cancelled Preserved:    ${report.summary.total_cancelled_preserved}`);
  console.log(`Total Ambiguous On Hold:      ${report.summary.total_ambiguous_on_hold}`);
  console.log('----------------------------------------------------');
  console.log('Bucket Breakdown:');
  for (const [bucket, data] of Object.entries(report.buckets)) {
    console.log(`  - ${bucket.padEnd(22)}: WRs = ${String(data.wr_count).padStart(4)}, Tasks = ${String(data.task_count).padStart(4)}`);
  }
  if (report.ambiguous_inventory.length > 0) {
    console.log('----------------------------------------------------');
    console.log(`⚠️  Ambiguous Inventory (${report.ambiguous_inventory.length} records require Admin review):`);
    for (const item of report.ambiguous_inventory) {
      console.log(`  * ID: ${item.work_request_id} | Title: "${item.title}" | Defaulted: ${item.defaulted_phase}`);
    }
  }
  if (report.mode === 'dry-run') {
    console.log('----------------------------------------------------');
    console.log('Dry-run completed successfully. Zero database mutations were committed.');
    console.log('To apply these changes, rerun with --apply.');
  }
  console.log('====================================================');
  /* eslint-enable no-console */
}

/**
 * CLI Main Entrypoint.
 */
async function main() {
  const options = parseArgs();

  // Resolve DATABASE_URL from the matching .env.<env> file (mirrors
  // scripts/migrate-remote.js) when not already present in the environment.
  if (!process.env.DATABASE_URL) {
    const envFiles = {
      local: '.env.development',
      dev: '.env.development',
      development: '.env.development',
      staging: '.env.staging',
      prod: '.env.production',
      production: '.env.production',
    };
    const envFile = envFiles[String(options.env).toLowerCase()];
    if (envFile) {
      const envPath = path.join(__dirname, '..', envFile);
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq === -1) continue;
          const key = trimmed.slice(0, eq).trim();
          const value = trimmed.slice(eq + 1).trim();
          if (key && process.env[key] === undefined) process.env[key] = value;
        }
      }
    }
  }

  const databaseUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const report = await runBackfill({
      client,
      apply: options.apply,
      env: options.env,
      reportPath: options.report,
    });
    printSummary(report);
  } catch (err) {
    /* eslint-disable no-console */
    console.error('❌ Backfill execution failed:', err.message);
    /* eslint-enable no-console */
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  STATUS_TO_PHASE_MAP,
  clampTaskPhase,
  mapStatusToPhase,
  recoverPriorStatus,
  parseArgs,
  runBackfill,
};
