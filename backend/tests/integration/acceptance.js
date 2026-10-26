/**
 * Acceptance Test Suite: Task Creation Approval Review Database Parcel
 *
 * Requirements:
 * - Exercises real PostgreSQL behavior, concurrency, and security guards per CONTRACT.md and TASK-DB-PARCEL.md.
 * - Explicit test database URL required via TASK_REVIEW_TEST_DATABASE_URL.
 * - Loopback safety guard ensures isolated local testing on 127.0.0.1 / localhost and refuses 'postgres' root DB.
 * - Asserts atomic row locking and concurrency races (8-way concurrent decide race, 4-way resubmit race).
 * - Asserts actor/lead revocation, Admin denial (Policy R5: NO Admin override), WR/entity linkage checks.
 * - Asserts required rejection reason, OCC version guards, stale/repeated decision rejection.
 * - Asserts explicit rejection of NULL decision and missing/invalid expectedVersion.
 * - Asserts writable parent check rejects archived, Cancelled, AND Completed work requests.
 * - Asserts immutable append-only event table denies UPDATE/DELETE even to service_role.
 * - Asserts canonical creator correction/resubmission whitelist and dependency validation.
 * - Asserts immutable history event retention and chronological audit trail.
 * - Asserts sign-off / WR phase advancement & completion guards and rejected-work SQL guards.
 * - Asserts clean migration rollback (down) and re-application (up).
 */

const { Client, Pool } = require('pg');
const migration = require('../../migrations/000074_task_creation_approval_review.js');

const testDbUrl = process.env.TASK_REVIEW_TEST_DATABASE_URL;

function assertSafeLocalDatabase(urlStr) {
  if (!urlStr) {
    throw new Error(
      'TASK_REVIEW_TEST_DATABASE_URL environment variable is required. Explicit test DB URL only.'
    );
  }
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch (err) {
    throw new Error(`Invalid TASK_REVIEW_TEST_DATABASE_URL: ${urlStr}`);
  }
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error(
      `Safety guard triggered: only local loopback targets allowed, got ${parsed.hostname}`
    );
  }
  const dbName = parsed.pathname.replace(/^\//, '');
  if (dbName === 'postgres') {
    throw new Error(
      "Safety guard triggered: target database cannot be 'postgres' (root owns postgres DB state). Must use dedicated task_review_test DB."
    );
  }
}

describe('Task Creation Approval Review Database Acceptance Suite', () => {
  let pool;
  let adminClient;

  // Test Fixture UUIDs
  const ENTITY_ATA_ID = 'e0000000-0000-4000-8000-000000000001';
  const ENTITY_LTA_ID = 'e0000000-0000-4000-8000-000000000002';

  const CLIENT_ATA_ID = 'd0000000-0000-4000-8000-000000000001';

  // Users
  const USER_ADMIN_ID = 'a0000000-0000-4000-8000-000000000001';
  const USER_LEAD_ID = 'b0000000-0000-4000-8000-000000000001';
  const USER_OTHER_LEAD_ID = 'b0000000-0000-4000-8000-000000000002';
  const USER_EMPLOYEE_ID = 'c0000000-0000-4000-8000-000000000001';
  const USER_OTHER_EMPLOYEE_ID = 'c0000000-0000-4000-8000-000000000002';
  const USER_INACTIVE_ID = 'c0000000-0000-4000-8000-000000000004';

  async function asRole(role, callback) {
    const client = await pool.connect();
    try {
      await client.query(`SET ROLE ${role}`);
      return await callback(client);
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  }

  async function asServiceRole(callback) {
    return asRole('service_role', callback);
  }

  async function cleanFixtureData(sql) {
    await adminClient.query(`
      SET task_review.allow_cleanup = 'on';
      ${sql}
      RESET task_review.allow_cleanup;
    `);
  }

  beforeAll(async () => {
    assertSafeLocalDatabase(testDbUrl);

    adminClient = new Client({ connectionString: testDbUrl });
    await adminClient.connect();

    // Ensure standard Supabase roles exist
    await adminClient.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END $$;
    `);

    // Ensure required base tables have primary keys if loaded from staging fixture
    await adminClient.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entities_pkey') THEN
          ALTER TABLE ONLY public.entities ADD CONSTRAINT entities_pkey PRIMARY KEY (id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_pkey') THEN
          ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_pkey') THEN
          ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_requests_pkey') THEN
          ALTER TABLE ONLY public.work_requests ADD CONSTRAINT work_requests_pkey PRIMARY KEY (id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_pkey') THEN
          ALTER TABLE ONLY public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
        END IF;
      END $$;
    `);

    // Apply migration 74 UP
    let upSql = '';
    migration.up({
      sql: (query) => {
        upSql = query;
      },
    });
    await adminClient.query(upSql);
    await adminClient.query("SET task_review.allow_cleanup = 'on';");

    pool = new Pool({ connectionString: testDbUrl, max: 12 });
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (adminClient) await adminClient.end();
  });

  // ---------------------------------------------------------------------------
  // 1. Schema & Migration Integrity
  // ---------------------------------------------------------------------------
  describe('1. Schema & Migration Integrity', () => {
    it('adds approval_status and review columns to tasks with approved default', async () => {
      const res = await adminClient.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tasks'
          AND column_name IN ('approval_status', 'created_by', 'reviewed_by', 'reviewed_at', 'rejection_reason')
        ORDER BY column_name;
      `);

      const colMap = Object.fromEntries(res.rows.map((r) => [r.column_name, r]));
      expect(colMap.approval_status).toBeDefined();
      expect(colMap.approval_status.is_nullable).toBe('NO');
      expect(colMap.approval_status.column_default).toContain('approved');
      expect(colMap.created_by).toBeDefined();
      expect(colMap.reviewed_by).toBeDefined();
      expect(colMap.reviewed_at).toBeDefined();
      expect(colMap.rejection_reason).toBeDefined();
    });

    it('enforces chk_tasks_approval_status check constraint', async () => {
      await expect(
        adminClient.query(`
          INSERT INTO public.tasks (id, work_request_id, title, approval_status)
          VALUES (gen_random_uuid(), 'f0000000-0000-4000-8000-000000000001', 'Invalid Status Task', 'bogus')
        `)
      ).rejects.toThrow(/chk_tasks_approval_status/);
    });

    it('grandfathers legacy existing rows as approved', async () => {
      const res = await adminClient.query(`
        SELECT id, approval_status
        FROM public.tasks
        WHERE id = '10000000-0000-4000-8000-000000000001';
      `);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].approval_status).toBe('approved');
    });

    it('creates immutable task_creation_review_events table with RLS enabled', async () => {
      const res = await adminClient.query(`
        SELECT relrowsecurity, relforcerowsecurity
        FROM pg_class
        WHERE relname = 'task_creation_review_events' AND relnamespace = 'public'::regnamespace;
      `);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].relrowsecurity).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Security & RPC Privilege Gating
  // ---------------------------------------------------------------------------
  describe('2. Security & RPC Privilege Gating', () => {
    it('denies anon and authenticated from executing task_creation_review_decide', async () => {
      for (const role of ['anon', 'authenticated']) {
        await asRole(role, async (client) => {
          await expect(
            client.query(
              'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6, $7)',
              [
                '10000000-0000-4000-8000-000000000001',
                'f0000000-0000-4000-8000-000000000001',
                ENTITY_ATA_ID,
                USER_LEAD_ID,
                1,
                'approve',
                null,
              ]
            )
          ).rejects.toThrow(/permission denied.*task_creation_review_decide/i);
        });
      }
    });

    it('denies anon and authenticated from executing task_creation_review_resubmit', async () => {
      for (const role of ['anon', 'authenticated']) {
        await asRole(role, async (client) => {
          await expect(
            client.query(
              'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
              [
                '10000000-0000-4000-8000-000000000001',
                'f0000000-0000-4000-8000-000000000001',
                ENTITY_ATA_ID,
                USER_EMPLOYEE_ID,
                1,
                JSON.stringify({ title: 'New' }),
              ]
            )
          ).rejects.toThrow(/permission denied.*task_creation_review_resubmit/i);
        });
      }
    });

    it('denies anon and authenticated from direct browser writes to task_creation_review_events', async () => {
      for (const role of ['anon', 'authenticated']) {
        await asRole(role, async (client) => {
          await expect(
            client.query(`
              INSERT INTO public.task_creation_review_events (task_id, work_request_id, entity_id, event_type)
              VALUES (
                '10000000-0000-4000-8000-000000000001',
                'f0000000-0000-4000-8000-000000000001',
                '${ENTITY_ATA_ID}',
                'decision'
              )
            `)
          ).rejects.toThrow(/permission denied.*task_creation_review_events/i);
        });
      }
    });

    it('denies service_role from updating or deleting rows in task_creation_review_events (append-only enforcement)', async () => {
      const eventId = '22000000-0000-4000-8000-000000000001';
      await cleanFixtureData(`
        DELETE FROM public.task_creation_review_events WHERE id = '${eventId}';
        INSERT INTO public.task_creation_review_events (
          id, task_id, work_request_id, entity_id, event_type, decision, actor_id, reason
        ) VALUES (
          '${eventId}', '10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
          '${ENTITY_ATA_ID}', 'decision', 'rejected', '${USER_LEAD_ID}', 'Initial reason'
        );
      `);

      await asServiceRole(async (client) => {
        // Attempt UPDATE
        await expect(
          client.query(
            "UPDATE public.task_creation_review_events SET reason = 'Tampered' WHERE id = $1",
            [eventId]
          )
        ).rejects.toThrow(/TASK_REVIEW_STATE.*append-only/);

        // Attempt DELETE
        await expect(
          client.query('DELETE FROM public.task_creation_review_events WHERE id = $1', [eventId])
        ).rejects.toThrow(/TASK_REVIEW_STATE.*append-only/);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Actor Authority, Admin Denial & Dynamic Lead Revocation
  // ---------------------------------------------------------------------------
  describe('3. Actor Authority, Admin Denial & Dynamic Lead Revocation', () => {
    let testWrId;
    let testTaskId;

    beforeEach(async () => {
      testWrId = 'f1000000-0000-4000-8000-000000000001';
      testTaskId = '11000000-0000-4000-8000-000000000001';

      await cleanFixtureData(`
        DELETE FROM public.task_creation_review_events WHERE task_id = '${testTaskId}';
        DELETE FROM public.tasks WHERE id = '${testTaskId}';
        DELETE FROM public.work_requests WHERE id = '${testWrId}';

        INSERT INTO public.work_requests (
          id, entity_id, client_id, title, assigned_to, requested_by,
          phase, status, creation_approval_status, version
        ) VALUES (
          '${testWrId}', '${ENTITY_ATA_ID}', '${CLIENT_ATA_ID}',
          'Authority Test WR', '${USER_LEAD_ID}', '${USER_LEAD_ID}',
          'pre_processing', 'Pre-processing', 'approved', 1
        );

        INSERT INTO public.tasks (
          id, work_request_id, title, status, phase, approval_status,
          created_by, version
        ) VALUES (
          '${testTaskId}', '${testWrId}', 'Authority Test Task',
          'Draft', 'pre_processing', 'pending', '${USER_EMPLOYEE_ID}', 1
        );
      `);
    });

    it('denies inactive actor from deciding task', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_INACTIVE_ID,
            1,
            'approve',
          ])
        ).rejects.toThrow(/TASK_REVIEW_FORBIDDEN.*Inactive or invalid actor/);
      });
    });

    it('denies Admin from deciding task (Policy R5: NO Admin override)', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_ADMIN_ID,
            1,
            'approve',
          ])
        ).rejects.toThrow(/TASK_REVIEW_FORBIDDEN.*Admin is not permitted/);
      });
    });

    it('denies non-Manager employee role from deciding task', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_EMPLOYEE_ID,
            1,
            'approve',
          ])
        ).rejects.toThrow(/TASK_REVIEW_FORBIDDEN.*Only Manager role/);
      });
    });

    it('denies a Manager who is NOT the WR assigned lead', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_OTHER_LEAD_ID,
            1,
            'approve',
          ])
        ).rejects.toThrow(/TASK_REVIEW_FORBIDDEN.*Only the assigned work request Manager lead/);
      });
    });

    it('enforces dynamic lead revocation if WR lead reassigned under database lock', async () => {
      await asServiceRole(async (client) => {
        // Reassign WR lead to USER_OTHER_LEAD_ID
        await client.query('UPDATE public.work_requests SET assigned_to = $1 WHERE id = $2', [
          USER_OTHER_LEAD_ID,
          testWrId,
        ]);

        // Previous lead USER_LEAD_ID must now immediately fail
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_LEAD_ID,
            1,
            'approve',
          ])
        ).rejects.toThrow(/TASK_REVIEW_FORBIDDEN.*Only the assigned work request Manager lead/);

        // New lead USER_OTHER_LEAD_ID now succeeds
        const res = await client.query(
          'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)',
          [testTaskId, testWrId, ENTITY_ATA_ID, USER_OTHER_LEAD_ID, 1, 'approve']
        );
        expect(res.rows.length).toBe(1);
        expect(res.rows[0].approval_status).toBe('approved');
        expect(res.rows[0].reviewed_by).toBe(USER_OTHER_LEAD_ID);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Entity Entitlement & Linkage Validation
  // ---------------------------------------------------------------------------
  describe('4. Entity Entitlement & Linkage Validation', () => {
    let testWrId;
    let testTaskId;

    beforeEach(async () => {
      testWrId = 'f1000000-0000-4000-8000-000000000002';
      testTaskId = '11000000-0000-4000-8000-000000000002';

      await cleanFixtureData(`
        DELETE FROM public.task_creation_review_events WHERE task_id = '${testTaskId}';
        DELETE FROM public.tasks WHERE id = '${testTaskId}';
        DELETE FROM public.work_requests WHERE id = '${testWrId}';

        INSERT INTO public.work_requests (
          id, entity_id, client_id, title, assigned_to, requested_by,
          phase, status, creation_approval_status, version
        ) VALUES (
          '${testWrId}', '${ENTITY_ATA_ID}', '${CLIENT_ATA_ID}',
          'Linkage Test WR', '${USER_LEAD_ID}', '${USER_LEAD_ID}',
          'pre_processing', 'Pre-processing', 'approved', 1
        );

        INSERT INTO public.tasks (
          id, work_request_id, title, status, phase, approval_status,
          created_by, version
        ) VALUES (
          '${testTaskId}', '${testWrId}', 'Linkage Test Task',
          'Draft', 'pre_processing', 'pending', '${USER_EMPLOYEE_ID}', 1
        );
      `);
    });

    it('rejects decision if WR entity does not match passed entity_id', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            testWrId,
            ENTITY_LTA_ID,
            USER_LEAD_ID,
            1,
            'approve',
          ])
        ).rejects.toThrow(/TASK_REVIEW_FORBIDDEN.*entity mismatch/);
      });
    });

    it('rejects decision if task does not belong to passed work_request_id', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            'f0000000-0000-4000-8000-000000000001',
            ENTITY_ATA_ID,
            USER_LEAD_ID,
            1,
            'approve',
          ])
        ).rejects.toThrow(/TASK_REVIEW_CONFLICT.*does not belong to work request/);
      });
    });

    it('rejects decision if parent WR is not admitted (creation_approval_status = pending)', async () => {
      await adminClient.query(
        "UPDATE public.work_requests SET creation_approval_status = 'pending' WHERE id = $1",
        [testWrId]
      );

      await asServiceRole(async (client) => {
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_LEAD_ID,
            1,
            'approve',
          ])
        ).rejects.toThrow(/TASK_REVIEW_STATE.*not admitted/);
      });
    });

    it('rejects decision and resubmission if parent WR is Completed (writable parent guard)', async () => {
      // Temporarily mark task approved so sign-off trigger permits setting WR status to Completed
      await adminClient.query(
        "UPDATE public.tasks SET approval_status = 'approved' WHERE id = $1",
        [testTaskId]
      );
      await adminClient.query(
        "UPDATE public.work_requests SET status = 'Completed' WHERE id = $1",
        [testWrId]
      );
      // Reset task to pending to test decide guard
      await adminClient.query("UPDATE public.tasks SET approval_status = 'pending' WHERE id = $1", [
        testTaskId,
      ]);

      await asServiceRole(async (client) => {
        // Decide fails on Completed parent WR
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_LEAD_ID,
            1,
            'approve',
          ])
        ).rejects.toThrow(/TASK_REVIEW_STATE.*archived, cancelled, or completed/);

        // Reset task to rejected to test resubmit guard
        await adminClient.query(
          "UPDATE public.tasks SET approval_status = 'rejected', rejection_reason = 'Needs fix' WHERE id = $1",
          [testTaskId]
        );

        // Resubmit fails on Completed parent WR
        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
            [
              testTaskId,
              testWrId,
              ENTITY_ATA_ID,
              USER_EMPLOYEE_ID,
              1,
              JSON.stringify({ title: 'New' }),
            ]
          )
        ).rejects.toThrow(/TASK_REVIEW_STATE.*archived, cancelled, or completed/);
      });
    });

    it('rejects decision if parent WR is cancelled or archived', async () => {
      await adminClient.query(
        "UPDATE public.work_requests SET status = 'Cancelled' WHERE id = $1",
        [testWrId]
      );

      await asServiceRole(async (client) => {
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_LEAD_ID,
            1,
            'approve',
          ])
        ).rejects.toThrow(/TASK_REVIEW_STATE.*archived, cancelled, or completed/);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Decision Validation & Execution (Approve vs Reject)
  // ---------------------------------------------------------------------------
  describe('5. Decision Validation & Execution', () => {
    let testWrId;
    let testTaskId;

    beforeEach(async () => {
      testWrId = 'f1000000-0000-4000-8000-000000000003';
      testTaskId = '11000000-0000-4000-8000-000000000003';

      await cleanFixtureData(`
        DELETE FROM public.task_creation_review_events WHERE task_id = '${testTaskId}';
        DELETE FROM public.tasks WHERE id = '${testTaskId}';
        DELETE FROM public.work_requests WHERE id = '${testWrId}';

        INSERT INTO public.work_requests (
          id, entity_id, client_id, title, assigned_to, requested_by,
          phase, status, creation_approval_status, version
        ) VALUES (
          '${testWrId}', '${ENTITY_ATA_ID}', '${CLIENT_ATA_ID}',
          'Decision Test WR', '${USER_LEAD_ID}', '${USER_LEAD_ID}',
          'pre_processing', 'Pre-processing', 'approved', 1
        );

        INSERT INTO public.tasks (
          id, work_request_id, title, status, phase, approval_status,
          created_by, version
        ) VALUES (
          '${testTaskId}', '${testWrId}', 'Decision Test Task',
          'Draft', 'pre_processing', 'pending', '${USER_EMPLOYEE_ID}', 1
        );
      `);
    });

    it('explicitly rejects NULL decision in task_creation_review_decide', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6, $7)',
            [testTaskId, testWrId, ENTITY_ATA_ID, USER_LEAD_ID, 1, null, null]
          )
        ).rejects.toThrow(/TASK_REVIEW_STATE.*Decision is required/);
      });
    });

    it('explicitly rejects missing or NULL expectedVersion in decide and resubmit', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6, $7)',
            [testTaskId, testWrId, ENTITY_ATA_ID, USER_LEAD_ID, null, 'approve', null]
          )
        ).rejects.toThrow(/TASK_REVIEW_CONFLICT.*expectedVersion is required/);

        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6, $7)',
            [testTaskId, testWrId, ENTITY_ATA_ID, USER_LEAD_ID, 0, 'approve', null]
          )
        ).rejects.toThrow(/TASK_REVIEW_CONFLICT.*expectedVersion is required/);

        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
            [
              testTaskId,
              testWrId,
              ENTITY_ATA_ID,
              USER_EMPLOYEE_ID,
              null,
              JSON.stringify({ title: 'Fixed' }),
            ]
          )
        ).rejects.toThrow(/TASK_REVIEW_CONFLICT.*expectedVersion is required/);
      });
    });

    it('rejects rejection without reason or with blank whitespace reason', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6, $7)',
            [testTaskId, testWrId, ENTITY_ATA_ID, USER_LEAD_ID, 1, 'reject', null]
          )
        ).rejects.toThrow(/TASK_REVIEW_REQUIRED.*Rejection reason is required/);

        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6, $7)',
            [testTaskId, testWrId, ENTITY_ATA_ID, USER_LEAD_ID, 1, 'reject', '   ']
          )
        ).rejects.toThrow(/TASK_REVIEW_REQUIRED.*Rejection reason is required/);
      });
    });

    it('successfully rejects task with non-blank reason and records event', async () => {
      await asServiceRole(async (client) => {
        const res = await client.query(
          'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6, $7)',
          [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_LEAD_ID,
            1,
            'reject',
            'Scope requires more detail',
          ]
        );

        expect(res.rows.length).toBe(1);
        const task = res.rows[0];
        expect(task.approval_status).toBe('rejected');
        expect(task.rejection_reason).toBe('Scope requires more detail');
        expect(task.reviewed_by).toBe(USER_LEAD_ID);
        expect(task.reviewed_at).toBeDefined();
        expect(task.version).toBe(2);

        const events = await client.query(
          'SELECT * FROM public.task_creation_review_events WHERE task_id = $1',
          [testTaskId]
        );
        expect(events.rows.length).toBe(1);
        expect(events.rows[0].event_type).toBe('decision');
        expect(events.rows[0].decision).toBe('rejected');
        expect(events.rows[0].actor_id).toBe(USER_LEAD_ID);
        expect(events.rows[0].reason).toBe('Scope requires more detail');
      });
    });

    it('successfully approves task and records event', async () => {
      await asServiceRole(async (client) => {
        const res = await client.query(
          'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)',
          [testTaskId, testWrId, ENTITY_ATA_ID, USER_LEAD_ID, 1, 'approve']
        );

        expect(res.rows.length).toBe(1);
        const task = res.rows[0];
        expect(task.approval_status).toBe('approved');
        expect(task.rejection_reason).toBeNull();
        expect(task.reviewed_by).toBe(USER_LEAD_ID);
        expect(task.reviewed_at).toBeDefined();
        expect(task.version).toBe(2);

        const events = await client.query(
          'SELECT * FROM public.task_creation_review_events WHERE task_id = $1',
          [testTaskId]
        );
        expect(events.rows.length).toBe(1);
        expect(events.rows[0].decision).toBe('approved');
      });
    });

    it('rejects invalid decision value', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_LEAD_ID,
            1,
            'maybe',
          ])
        ).rejects.toThrow(/TASK_REVIEW_STATE.*Invalid decision/);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 6. OCC Concurrency Guards & Stale / Repeated Decisions
  // ---------------------------------------------------------------------------
  describe('6. OCC Concurrency Guards & Stale / Repeated Decisions', () => {
    let testWrId;
    let testTaskId;

    beforeEach(async () => {
      testWrId = 'f1000000-0000-4000-8000-000000000004';
      testTaskId = '11000000-0000-4000-8000-000000000004';

      await cleanFixtureData(`
        DELETE FROM public.task_creation_review_events WHERE task_id = '${testTaskId}';
        DELETE FROM public.tasks WHERE id = '${testTaskId}';
        DELETE FROM public.work_requests WHERE id = '${testWrId}';

        INSERT INTO public.work_requests (
          id, entity_id, client_id, title, assigned_to, requested_by,
          phase, status, creation_approval_status, version
        ) VALUES (
          '${testWrId}', '${ENTITY_ATA_ID}', '${CLIENT_ATA_ID}',
          'OCC Test WR', '${USER_LEAD_ID}', '${USER_LEAD_ID}',
          'pre_processing', 'Pre-processing', 'approved', 1
        );

        INSERT INTO public.tasks (
          id, work_request_id, title, status, phase, approval_status,
          created_by, version
        ) VALUES (
          '${testTaskId}', '${testWrId}', 'OCC Test Task',
          'Draft', 'pre_processing', 'pending', '${USER_EMPLOYEE_ID}', 1
        );
      `);
    });

    it('rejects decision with stale expected_version', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_LEAD_ID,
            999,
            'approve',
          ])
        ).rejects.toThrow(/TASK_REVIEW_CONFLICT.*version mismatch/);
      });
    });

    it('rejects repeated / stale decision on already-approved task', async () => {
      await asServiceRole(async (client) => {
        // First decision: approve
        await client.query(
          'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)',
          [testTaskId, testWrId, ENTITY_ATA_ID, USER_LEAD_ID, 1, 'approve']
        );

        // Second decision on already approved task fails with TASK_REVIEW_STATE
        await expect(
          client.query('SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)', [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_LEAD_ID,
            2,
            'approve',
          ])
        ).rejects.toThrow(/TASK_REVIEW_STATE.*not pending review/);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Creator Correction & Resubmission Whitelist
  // ---------------------------------------------------------------------------
  describe('7. Creator Correction & Resubmission', () => {
    let testWrId;
    let testTaskId;
    let predTaskId;

    beforeEach(async () => {
      testWrId = 'f1000000-0000-4000-8000-000000000005';
      testTaskId = '11000000-0000-4000-8000-000000000005';
      predTaskId = '11000000-0000-4000-8000-000000000055';

      await cleanFixtureData(`
        DELETE FROM public.task_creation_review_events WHERE task_id IN ('${testTaskId}', '${predTaskId}');
        DELETE FROM public.tasks WHERE id IN ('${testTaskId}', '${predTaskId}');
        DELETE FROM public.work_requests WHERE id = '${testWrId}';

        INSERT INTO public.work_requests (
          id, entity_id, client_id, title, assigned_to, requested_by,
          phase, status, creation_approval_status, version
        ) VALUES (
          '${testWrId}', '${ENTITY_ATA_ID}', '${CLIENT_ATA_ID}',
          'Resubmit Test WR', '${USER_LEAD_ID}', '${USER_LEAD_ID}',
          'pre_processing', 'Pre-processing', 'approved', 1
        );

        INSERT INTO public.tasks (
          id, work_request_id, title, status, phase, approval_status,
          created_by, version
        ) VALUES (
          '${predTaskId}', '${testWrId}', 'Predecessor Task',
          'Draft', 'pre_processing', 'approved', '${USER_EMPLOYEE_ID}', 1
        );

        INSERT INTO public.tasks (
          id, work_request_id, title, description, status, phase,
          approval_status, created_by, version, rejection_reason, reviewed_by, reviewed_at
        ) VALUES (
          '${testTaskId}', '${testWrId}', 'Rejected Task', 'Initial description',
          'In Progress', 'pre_processing', 'rejected', '${USER_EMPLOYEE_ID}', 2,
          'Initial rejection reason', '${USER_LEAD_ID}', now()
        );
      `);
    });

    it('denies non-creator from resubmitting rejected task', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
            [
              testTaskId,
              testWrId,
              ENTITY_ATA_ID,
              USER_OTHER_EMPLOYEE_ID,
              2,
              JSON.stringify({ title: 'Fixed' }),
            ]
          )
        ).rejects.toThrow(/TASK_REVIEW_FORBIDDEN.*Only the task creator can resubmit/);
      });
    });

    it('rejects resubmission on a task that is NOT rejected', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
            [
              predTaskId,
              testWrId,
              ENTITY_ATA_ID,
              USER_EMPLOYEE_ID,
              1,
              JSON.stringify({ title: 'Fixed' }),
            ]
          )
        ).rejects.toThrow(/TASK_REVIEW_STATE.*Only rejected tasks can be resubmitted/);
      });
    });

    it('rejects non-whitelisted / forbidden field in resubmission data', async () => {
      await asServiceRole(async (client) => {
        // Attempting to inject status
        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
            [
              testTaskId,
              testWrId,
              ENTITY_ATA_ID,
              USER_EMPLOYEE_ID,
              2,
              JSON.stringify({ status: 'Completed' }),
            ]
          )
        ).rejects.toThrow(/TASK_REVIEW_STATE.*Unsupported field/);

        // Attempting to inject phase
        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
            [
              testTaskId,
              testWrId,
              ENTITY_ATA_ID,
              USER_EMPLOYEE_ID,
              2,
              JSON.stringify({ phase: 'processing' }),
            ]
          )
        ).rejects.toThrow(/TASK_REVIEW_STATE.*Unsupported field/);

        // Attempting to inject approval_status
        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
            [
              testTaskId,
              testWrId,
              ENTITY_ATA_ID,
              USER_EMPLOYEE_ID,
              2,
              JSON.stringify({ approval_status: 'approved' }),
            ]
          )
        ).rejects.toThrow(/TASK_REVIEW_STATE.*Unsupported field/);
      });
    });

    it('rejects invalid predecessor task belonging to another WR', async () => {
      const foreignTaskId = '10000000-0000-4000-8000-000000000001';
      await asServiceRole(async (client) => {
        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
            [
              testTaskId,
              testWrId,
              ENTITY_ATA_ID,
              USER_EMPLOYEE_ID,
              2,
              JSON.stringify({ predecessors: [foreignTaskId] }),
            ]
          )
        ).rejects.toThrow(/TASK_REVIEW_STATE.*does not belong to same work request/);
      });
    });

    it('rejects inactive or unentitled assignee in resubmission data', async () => {
      await asServiceRole(async (client) => {
        await expect(
          client.query(
            'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
            [
              testTaskId,
              testWrId,
              ENTITY_ATA_ID,
              USER_EMPLOYEE_ID,
              2,
              JSON.stringify({ assigneeId: USER_INACTIVE_ID }),
            ]
          )
        ).rejects.toThrow(/TASK_REVIEW_FORBIDDEN.*Assignee is inactive or invalid/);
      });
    });

    it('successfully resubmits with whitelisted corrections, returns pending, preserves execution status and records event', async () => {
      await asServiceRole(async (client) => {
        const corrections = {
          title: 'Corrected Task Title',
          description: 'Refined scope and objectives',
          dueDate: '2026-11-15T00:00:00Z',
          predecessors: [predTaskId],
          assignees: [USER_OTHER_EMPLOYEE_ID],
          requiredLinkType: 'transmittal',
        };

        const res = await client.query(
          'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
          [testTaskId, testWrId, ENTITY_ATA_ID, USER_EMPLOYEE_ID, 2, JSON.stringify(corrections)]
        );

        expect(res.rows.length).toBe(1);
        const task = res.rows[0];
        expect(task.approval_status).toBe('pending');
        expect(task.title).toBe('Corrected Task Title');
        expect(task.description).toBe('Refined scope and objectives');
        expect(task.status).toBe('In Progress'); // Execution status preserved!
        expect(task.phase).toBe('pre_processing'); // Phase preserved!
        expect(task.rejection_reason).toBeNull();
        expect(task.reviewed_by).toBeNull();
        expect(task.reviewed_at).toBeNull();
        expect(task.assignee_id).toBe(USER_OTHER_EMPLOYEE_ID);
        expect(task.required_link_type).toBe('transmittal');
        expect(task.predecessors).toEqual([predTaskId]);
        expect(task.version).toBe(3);

        // Verify task_assignees table synced
        const assignees = await client.query(
          'SELECT user_id FROM public.task_assignees WHERE task_id = $1',
          [testTaskId]
        );
        expect(assignees.rows.map((r) => r.user_id)).toContain(USER_OTHER_EMPLOYEE_ID);

        // Verify resubmission event recorded
        const events = await client.query(
          'SELECT * FROM public.task_creation_review_events WHERE task_id = $1 AND event_type = $2',
          [testTaskId, 'resubmission']
        );
        expect(events.rows.length).toBe(1);
        expect(events.rows[0].actor_id).toBe(USER_EMPLOYEE_ID);
        expect(events.rows[0].metadata.prior_approval_status).toBe('rejected');
        expect(events.rows[0].metadata.prior_rejection_reason).toBe('Initial rejection reason');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Immutable Chronological History Trail
  // ---------------------------------------------------------------------------
  describe('8. Immutable History Audit Trail', () => {
    let testWrId;
    let testTaskId;

    beforeEach(async () => {
      testWrId = 'f1000000-0000-4000-8000-000000000006';
      testTaskId = '11000000-0000-4000-8000-000000000006';

      await cleanFixtureData(`
        DELETE FROM public.task_creation_review_events WHERE task_id = '${testTaskId}';
        DELETE FROM public.tasks WHERE id = '${testTaskId}';
        DELETE FROM public.work_requests WHERE id = '${testWrId}';

        INSERT INTO public.work_requests (
          id, entity_id, client_id, title, assigned_to, requested_by,
          phase, status, creation_approval_status, version
        ) VALUES (
          '${testWrId}', '${ENTITY_ATA_ID}', '${CLIENT_ATA_ID}',
          'History Audit WR', '${USER_LEAD_ID}', '${USER_LEAD_ID}',
          'pre_processing', 'Pre-processing', 'approved', 1
        );

        INSERT INTO public.tasks (
          id, work_request_id, title, status, phase, approval_status,
          created_by, version
        ) VALUES (
          '${testTaskId}', '${testWrId}', 'Lifecycle Task',
          'Draft', 'pre_processing', 'pending', '${USER_EMPLOYEE_ID}', 1
        );
      `);
    });

    it('preserves full chronological lifecycle: rejection -> resubmission -> approval', async () => {
      await asServiceRole(async (client) => {
        // Step 1: Lead rejects
        await client.query(
          'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6, $7)',
          [testTaskId, testWrId, ENTITY_ATA_ID, USER_LEAD_ID, 1, 'reject', 'Missing due date']
        );

        // Step 2: Creator resubmits
        await client.query(
          'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
          [
            testTaskId,
            testWrId,
            ENTITY_ATA_ID,
            USER_EMPLOYEE_ID,
            2,
            JSON.stringify({ dueDate: '2026-12-01T00:00:00Z' }),
          ]
        );

        // Step 3: Lead approves
        await client.query(
          'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6)',
          [testTaskId, testWrId, ENTITY_ATA_ID, USER_LEAD_ID, 3, 'approve']
        );

        // Verify full event audit trail
        const events = await client.query(
          'SELECT event_type, decision, actor_id, reason, created_at FROM public.task_creation_review_events WHERE task_id = $1 ORDER BY created_at ASC',
          [testTaskId]
        );

        expect(events.rows.length).toBe(3);
        expect(events.rows[0].event_type).toBe('decision');
        expect(events.rows[0].decision).toBe('rejected');
        expect(events.rows[0].reason).toBe('Missing due date');
        expect(events.rows[0].actor_id).toBe(USER_LEAD_ID);

        expect(events.rows[1].event_type).toBe('resubmission');
        expect(events.rows[1].actor_id).toBe(USER_EMPLOYEE_ID);

        expect(events.rows[2].event_type).toBe('decision');
        expect(events.rows[2].decision).toBe('approved');
        expect(events.rows[2].actor_id).toBe(USER_LEAD_ID);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Concurrency Races (Row-Level Locking)
  // ---------------------------------------------------------------------------
  describe('9. Concurrency Races (Row-Level Locking)', () => {
    let testWrId;
    let testTaskId;

    beforeEach(async () => {
      testWrId = 'f1000000-0000-4000-8000-000000000007';
      testTaskId = '11000000-0000-4000-8000-000000000007';

      await cleanFixtureData(`
        DELETE FROM public.task_creation_review_events WHERE task_id = '${testTaskId}';
        DELETE FROM public.tasks WHERE id = '${testTaskId}';
        DELETE FROM public.work_requests WHERE id = '${testWrId}';

        INSERT INTO public.work_requests (
          id, entity_id, client_id, title, assigned_to, requested_by,
          phase, status, creation_approval_status, version
        ) VALUES (
          '${testWrId}', '${ENTITY_ATA_ID}', '${CLIENT_ATA_ID}',
          'Concurrency Race WR', '${USER_LEAD_ID}', '${USER_LEAD_ID}',
          'pre_processing', 'Pre-processing', 'approved', 1
        );

        INSERT INTO public.tasks (
          id, work_request_id, title, status, phase, approval_status,
          created_by, version
        ) VALUES (
          '${testTaskId}', '${testWrId}', 'Concurrent Task',
          'Draft', 'pre_processing', 'pending', '${USER_EMPLOYEE_ID}', 1
        );
      `);
    });

    it('8-way concurrent decide race: exactly 1 transaction wins and increments version once', async () => {
      const concurrency = 8;
      const promises = Array.from({ length: concurrency }, async (_, idx) => {
        const client = await pool.connect();
        try {
          await client.query('SET ROLE service_role');
          const decision = idx % 2 === 0 ? 'approve' : 'reject';
          const reason = idx % 2 === 0 ? null : 'Concurrent reject';
          return await client.query(
            'SELECT * FROM public.task_creation_review_decide($1, $2, $3, $4, $5, $6, $7)',
            [testTaskId, testWrId, ENTITY_ATA_ID, USER_LEAD_ID, 1, decision, reason]
          );
        } catch (err) {
          return { error: err.message };
        } finally {
          await client.query('RESET ROLE');
          client.release();
        }
      });

      const results = await Promise.all(promises);
      const successes = results.filter((r) => r.rows && r.rows.length > 0);
      const failures = results.filter((r) => r.error);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(concurrency - 1);

      // Verify failure messages are all machine-readable OCC / state conflicts
      for (const f of failures) {
        expect(f.error).toMatch(/TASK_REVIEW_CONFLICT|TASK_REVIEW_STATE/);
      }

      // Verify task row version is exactly 2
      const taskRes = await adminClient.query(
        'SELECT version, approval_status FROM public.tasks WHERE id = $1',
        [testTaskId]
      );
      expect(taskRes.rows[0].version).toBe(2);
      expect(['approved', 'rejected']).toContain(taskRes.rows[0].approval_status);
    });

    it('4-way concurrent resubmit race: exactly 1 transaction wins', async () => {
      // Mark task as rejected first
      await adminClient.query(
        "UPDATE public.tasks SET approval_status = 'rejected', rejection_reason = 'Needs fix', version = 2 WHERE id = $1",
        [testTaskId]
      );

      const concurrency = 4;
      const promises = Array.from({ length: concurrency }, async (_, idx) => {
        const client = await pool.connect();
        try {
          await client.query('SET ROLE service_role');
          return await client.query(
            'SELECT * FROM public.task_creation_review_resubmit($1, $2, $3, $4, $5, $6)',
            [
              testTaskId,
              testWrId,
              ENTITY_ATA_ID,
              USER_EMPLOYEE_ID,
              2,
              JSON.stringify({ title: `Concurrent Resubmit ${idx}` }),
            ]
          );
        } catch (err) {
          return { error: err.message };
        } finally {
          await client.query('RESET ROLE');
          client.release();
        }
      });

      const results = await Promise.all(promises);
      const successes = results.filter((r) => r.rows && r.rows.length > 0);
      const failures = results.filter((r) => r.error);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(concurrency - 1);

      const taskRes = await adminClient.query(
        'SELECT version, approval_status FROM public.tasks WHERE id = $1',
        [testTaskId]
      );
      expect(taskRes.rows[0].version).toBe(3);
      expect(taskRes.rows[0].approval_status).toBe('pending');
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Rejected-Work SQL Guards
  // ---------------------------------------------------------------------------
  describe('10. Rejected-Work SQL Guards', () => {
    let testWrId;
    let testTaskId;

    beforeEach(async () => {
      testWrId = 'f1000000-0000-4000-8000-000000000008';
      testTaskId = '11000000-0000-4000-8000-000000000008';

      await cleanFixtureData(`
        DELETE FROM public.task_creation_review_events WHERE task_id = '${testTaskId}';
        DELETE FROM public.tasks WHERE id = '${testTaskId}';
        DELETE FROM public.work_requests WHERE id = '${testWrId}';

        INSERT INTO public.work_requests (
          id, entity_id, client_id, title, assigned_to, requested_by,
          phase, status, creation_approval_status, version
        ) VALUES (
          '${testWrId}', '${ENTITY_ATA_ID}', '${CLIENT_ATA_ID}',
          'Rejected Work Guard WR', '${USER_LEAD_ID}', '${USER_LEAD_ID}',
          'pre_processing', 'Pre-processing', 'approved', 1
        );

        INSERT INTO public.tasks (
          id, work_request_id, title, status, phase, approval_status,
          created_by, version, rejection_reason
        ) VALUES (
          '${testTaskId}', '${testWrId}', 'Rejected Guard Task',
          'Draft', 'pre_processing', 'rejected', '${USER_EMPLOYEE_ID}', 2, 'Reason'
        );
      `);
    });

    it('blocks ordinary status modification on rejected task (Policy R6)', async () => {
      await expect(
        adminClient.query("UPDATE public.tasks SET status = 'In Progress' WHERE id = $1", [
          testTaskId,
        ])
      ).rejects.toThrow(/TASK_REJECTED_LOCKED.*Cannot modify rejected task without resubmission/);
    });

    it('blocks ordinary material edit on rejected task without resubmission', async () => {
      await expect(
        adminClient.query("UPDATE public.tasks SET title = 'Sneaky Edit' WHERE id = $1", [
          testTaskId,
        ])
      ).rejects.toThrow(/TASK_REJECTED_LOCKED.*Cannot modify rejected task without resubmission/);
    });

    it('blocks checklist creation or modification on rejected task', async () => {
      await expect(
        adminClient.query('INSERT INTO public.task_checklists (task_id, text) VALUES ($1, $2)', [
          testTaskId,
          'Disallowed checklist item',
        ])
      ).rejects.toThrow(/TASK_REJECTED_LOCKED.*Cannot modify checklists on a rejected task/);
    });

    it('blocks time logging on rejected task', async () => {
      await expect(
        adminClient.query(
          'INSERT INTO public.task_time_logs (task_id, hours, user_id) VALUES ($1, $2, $3)',
          [testTaskId, 2.5, USER_EMPLOYEE_ID]
        )
      ).rejects.toThrow(/TASK_REJECTED_LOCKED.*Cannot log time on a rejected task/);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Sign-off / WR Phase Advancement & Completion Guards
  // ---------------------------------------------------------------------------
  describe('11. Sign-off & Completion Guards', () => {
    let testWrId;
    let pendingTaskId;
    let approvedTaskId;

    beforeEach(async () => {
      testWrId = 'f1000000-0000-4000-8000-000000000009';
      pendingTaskId = '11000000-0000-4000-8000-000000000009';
      approvedTaskId = '11000000-0000-4000-8000-000000000099';

      await cleanFixtureData(`
        DELETE FROM public.task_creation_review_events WHERE task_id IN ('${pendingTaskId}', '${approvedTaskId}');
        DELETE FROM public.tasks WHERE work_request_id = '${testWrId}';
        DELETE FROM public.work_requests WHERE id = '${testWrId}';

        INSERT INTO public.work_requests (
          id, entity_id, client_id, title, assigned_to, requested_by,
          phase, status, creation_approval_status, version
        ) VALUES (
          '${testWrId}', '${ENTITY_ATA_ID}', '${CLIENT_ATA_ID}',
          'Sign-off Guard WR', '${USER_LEAD_ID}', '${USER_LEAD_ID}',
          'pre_processing', 'Pre-processing', 'approved', 1
        );

        INSERT INTO public.tasks (
          id, work_request_id, title, status, phase, approval_status,
          created_by, version
        ) VALUES (
          '${pendingTaskId}', '${testWrId}', 'Pending Sign-off Task',
          'Completed', 'pre_processing', 'pending', '${USER_EMPLOYEE_ID}', 1
        ), (
          '${approvedTaskId}', '${testWrId}', 'Approved Task',
          'Completed', 'pre_processing', 'approved', '${USER_EMPLOYEE_ID}', 1
        );
      `);
    });

    it('blocks WR phase advancement when pending tasks exist (even when execution status is Completed)', async () => {
      await expect(
        adminClient.query(
          "UPDATE public.work_requests SET phase = 'processing', status = 'Processing' WHERE id = $1",
          [testWrId]
        )
      ).rejects.toThrow(/TASK_REVIEW_REQUIRED.*Cannot advance phase or complete/);
    });

    it('blocks WR status = Completed when pending tasks exist', async () => {
      await expect(
        adminClient.query("UPDATE public.work_requests SET status = 'Completed' WHERE id = $1", [
          testWrId,
        ])
      ).rejects.toThrow(/TASK_REVIEW_REQUIRED.*Cannot advance phase or complete/);
    });

    it('blocks WR phase advancement and completion when rejected tasks exist', async () => {
      await adminClient.query(
        "UPDATE public.tasks SET approval_status = 'rejected', rejection_reason = 'Needs fix' WHERE id = $1",
        [pendingTaskId]
      );

      await expect(
        adminClient.query("UPDATE public.work_requests SET phase = 'processing' WHERE id = $1", [
          testWrId,
        ])
      ).rejects.toThrow(/TASK_REVIEW_REQUIRED.*Cannot advance phase or complete/);

      await expect(
        adminClient.query("UPDATE public.work_requests SET status = 'Completed' WHERE id = $1", [
          testWrId,
        ])
      ).rejects.toThrow(/TASK_REVIEW_REQUIRED.*Cannot advance phase or complete/);
    });

    it('allows WR phase advancement and completion once all tasks are approved', async () => {
      await adminClient.query(
        "UPDATE public.tasks SET approval_status = 'approved' WHERE id = $1",
        [pendingTaskId]
      );

      // Advancing phase to processing succeeds
      await expect(
        adminClient.query(
          "UPDATE public.work_requests SET phase = 'processing', status = 'Processing' WHERE id = $1",
          [testWrId]
        )
      ).resolves.not.toThrow();

      // Advancing phase to quality_assurance succeeds
      await expect(
        adminClient.query(
          "UPDATE public.work_requests SET phase = 'quality_assurance' WHERE id = $1",
          [testWrId]
        )
      ).resolves.not.toThrow();

      // Advancing phase to completion and setting status to Completed succeeds
      await expect(
        adminClient.query(
          "UPDATE public.work_requests SET phase = 'completion', status = 'Completed' WHERE id = $1",
          [testWrId]
        )
      ).resolves.not.toThrow();
    });

    it('preserves ordinary backward rerouting and reopening semantics without blocking', async () => {
      await adminClient.query(`
        UPDATE public.tasks SET approval_status = 'approved' WHERE work_request_id = '${testWrId}';
        UPDATE public.work_requests SET phase = 'processing', status = 'Processing' WHERE id = '${testWrId}';
      `);

      const newPendingTaskId = '11000000-0000-4000-8000-000000000098';
      await cleanFixtureData(`
        DELETE FROM public.tasks WHERE id = '${newPendingTaskId}';
        INSERT INTO public.tasks (id, work_request_id, title, approval_status, version)
        VALUES ('${newPendingTaskId}', '${testWrId}', 'New Pending Task', 'pending', 1);
      `);

      // Backward transition: processing -> pre_processing must NOT be blocked!
      await expect(
        adminClient.query(
          "UPDATE public.work_requests SET phase = 'pre_processing', status = 'Pre-processing' WHERE id = $1",
          [testWrId]
        )
      ).resolves.not.toThrow();

      // Cancelling WR is also NOT blocked
      await expect(
        adminClient.query("UPDATE public.work_requests SET status = 'Cancelled' WHERE id = $1", [
          testWrId,
        ])
      ).resolves.not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Migration Reversibility (Rollback & Re-application)
  // ---------------------------------------------------------------------------
  describe('12. Migration Reversibility', () => {
    it('rolls back cleanly via down migration and re-applies cleanly via up', async () => {
      let downSql = '';
      migration.down({
        sql: (query) => {
          downSql = query;
        },
      });
      await adminClient.query(downSql);

      const funcRes = await adminClient.query(
        "SELECT proname FROM pg_proc WHERE proname LIKE 'task_creation_review%';"
      );
      expect(funcRes.rows.length).toBe(0);

      const tableRes = await adminClient.query(
        "SELECT to_regclass('public.task_creation_review_events');"
      );
      expect(tableRes.rows[0].to_regclass).toBeNull();

      let upSql = '';
      migration.up({
        sql: (query) => {
          upSql = query;
        },
      });
      await adminClient.query(upSql);
      await adminClient.query("SET task_review.allow_cleanup = 'on';");

      const funcRecheck = await adminClient.query(
        "SELECT proname FROM pg_proc WHERE proname LIKE 'task_creation_review%';"
      );
      expect(funcRecheck.rows.length).toBe(2);
    });
  });
});
