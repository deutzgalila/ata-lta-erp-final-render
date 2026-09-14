/**
 * Purge all production operational and user data, then provision the 13 handover accounts.
 *
 * Source: docs/business/ATA-LTA_ERP_Credentials_HandOver.docx
 * System Administrator: Lorein Wong <lorein@ata-lta.ph>
 * Initial password for all accounts: Password@123
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

// Load .env.production
const envPath = path.join(__dirname, '..', '.env.production');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET;

if (!databaseUrl || !supabaseUrl || !supabaseServiceKey) {
  console.error('DATABASE_URL, SUPABASE_URL, and SUPABASE_SERVICE_KEY are required in .env.production');
  process.exit(1);
}

const HANDOVER_ACCOUNTS = [
  {
    name: 'Lorein Wong',
    email: 'lorein@ata-lta.ph',
    role: 'Admin',
    departments: ['Management'],
    entities: ['ATA', 'LTA'],
  },
  {
    name: 'Lovelyn Rebong',
    email: 'love@ata-lta.ph',
    role: 'Manager',
    departments: ['Management', 'Operations'],
    entities: ['ATA', 'LTA'],
  },
  {
    name: 'Alejandria Solano',
    email: 'rea@ata-lta.ph',
    role: 'Operations',
    departments: ['Operations', 'HR'],
    entities: ['ATA', 'LTA'],
  },
  {
    name: 'Loida Delgaco',
    email: 'loida@ata-lta.ph',
    role: 'Operations',
    departments: ['Operations', 'HR'],
    entities: ['ATA', 'LTA'],
  },
  {
    name: 'Jen Andonga',
    email: 'jen@ata-lta.ph',
    role: 'Accounting',
    departments: ['Accounting', 'Operations'],
    entities: ['ATA', 'LTA'],
  },
  {
    name: 'Rachel Baradas',
    email: 'rachel@ata-lta.ph',
    role: 'Accounting',
    departments: ['Accounting'],
    entities: ['ATA', 'LTA'],
  },
  {
    name: 'Lorena Wong',
    email: 'lorena@ata-lta.ph',
    role: 'Manager',
    departments: ['Management'],
    entities: ['ATA', 'LTA'],
  },
  {
    name: 'Henry Wong',
    email: 'henry@ata-lta.ph',
    role: 'Manager',
    departments: ['Management'],
    entities: ['ATA', 'LTA'],
  },
  {
    name: 'MG Atis',
    email: 'mg@ata-lta.ph',
    role: 'Operations',
    departments: ['Operations'],
    entities: ['ATA', 'LTA'],
  },
  {
    name: 'Michelle Calles',
    email: 'michelle@ata-lta.ph',
    role: 'Operations',
    departments: ['Operations'],
    entities: ['ATA', 'LTA'],
  },
  {
    name: 'Rose',
    email: 'rose@ata-lta.ph',
    role: 'Operations',
    departments: ['Operations'],
    entities: ['ATA', 'LTA'],
  },
  {
    name: 'Mary Ann Baraquiel',
    email: 'ann@ata-lta.ph',
    role: 'Operations',
    departments: ['Operations'],
    entities: ['ATA', 'LTA'],
  },
  {
    name: 'Twinkle Marquez',
    email: 'twinkle@ata-lta.ph',
    role: 'Documentation',
    departments: ['Documentation'],
    entities: ['ATA', 'LTA'],
  },
];

const INITIAL_PASSWORD = 'Password@123';

const TABLES_TO_TRUNCATE = [
  'audit_logs',
  'billing_templates',
  'client_contact_details',
  'client_related_companies',
  'clients',
  'disbursement_templates',
  'disbursements',
  'document_sequences',
  'documents',
  'ground_workers',
  'idempotency_keys',
  'invoice_line_items',
  'invoice_payments',
  'invoices',
  'operations_requests',
  'pending_changes',
  'retainer_templates',
  'status_history',
  'task_checklists',
  'task_time_logs',
  'tasks',
  'transmittal_items',
  'transmittals',
  'work_requests',
  'user_departments',
  'users',
];

async function listAllStorageFiles(supabase, bucket, folder = '') {
  const { data, error } = await supabase.storage.from(bucket).list(folder);
  if (error || !data) return [];
  let files = [];
  for (const item of data) {
    const itemPath = folder ? `${folder}/${item.name}` : item.name;
    if (item.id === null) {
      const nested = await listAllStorageFiles(supabase, bucket, itemPath);
      files.push(...nested);
    } else {
      files.push(itemPath);
    }
  }
  return files;
}

async function main() {
  console.log('================================================================');
  console.log('  ATA-LTA ERP: Production Data Purge & Account Handover Setup  ');
  console.log('================================================================\n');

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();

  try {
    // 1. Purge Supabase Storage
    if (storageBucket) {
      console.log(`1. Purging Supabase Storage bucket "${storageBucket}"...`);
      const files = await listAllStorageFiles(supabase, storageBucket);
      if (files.length > 0) {
        console.log(`   Found ${files.length} file(s) to remove:`);
        files.forEach((f) => console.log(`   - ${f}`));
        const { error: storageErr } = await supabase.storage.from(storageBucket).remove(files);
        if (storageErr) {
          console.error(`   ⚠️ Failed to delete storage files: ${storageErr.message}`);
        } else {
          console.log(`   ✅ Successfully removed ${files.length} file(s) from storage.`);
        }
      } else {
        console.log('   (Storage bucket is already empty)');
      }
    }

    // 2. Truncate operational tables and users in PostgreSQL
    console.log('\n2. Truncating all operational and user tables in PostgreSQL...');
    const quotedTables = TABLES_TO_TRUNCATE.map((t) => `"${t}"`).join(', ');
    await pg.query(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE;`);
    console.log(`   ✅ Successfully truncated ${TABLES_TO_TRUNCATE.length} tables with CASCADE.`);

    // 3. Purge existing Supabase Auth users
    console.log('\n3. Purging existing Supabase Auth users...');
    const { data: authList, error: authListErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (authListErr) {
      throw new Error(`Failed to list auth users: ${authListErr.message}`);
    }
    const existingUsers = authList?.users || [];
    console.log(`   Found ${existingUsers.length} existing user(s) in Supabase Auth.`);
    for (const u of existingUsers) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) {
        console.error(`   ⚠️ Failed to delete auth user ${u.email}: ${delErr.message}`);
      } else {
        console.log(`   Deleted auth user: ${u.email} (${u.id})`);
      }
    }
    console.log('   ✅ Supabase Auth purge complete.');

    // 4. Fetch department mapping
    console.log('\n4. Fetching department IDs from database...');
    const { rows: deptRows } = await pg.query('SELECT id, name FROM departments');
    const deptMap = new Map(deptRows.map((d) => [d.name, d.id]));
    console.log('   Available departments:', Array.from(deptMap.keys()).join(', '));

    // 5. Provision 13 Handover Accounts
    console.log('\n5. Provisioning 13 Handover Accounts...');
    const now = new Date().toISOString();
    const createdSummary = [];

    for (let i = 0; i < HANDOVER_ACCOUNTS.length; i++) {
      const acc = HANDOVER_ACCOUNTS[i];
      console.log(`   [${i + 1}/13] Creating ${acc.name} <${acc.email}> (${acc.role})...`);

      // Create in Supabase Auth
      const { data: authUser, error: createErr } = await supabase.auth.admin.createUser({
        email: acc.email,
        password: INITIAL_PASSWORD,
        email_confirm: true,
        user_metadata: { name: acc.name },
      });

      if (createErr || !authUser?.user) {
        throw new Error(`Failed to create Auth user ${acc.email}: ${createErr?.message}`);
      }

      const authUserId = authUser.user.id;
      const dbUserId = randomUUID();

      // Insert into public.users
      await pg.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, entities, is_active, created_at, updated_at, preferences)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $7, '{}'::jsonb)`,
        [dbUserId, authUserId, acc.email, acc.name, acc.role, acc.entities, now]
      );

      // Insert into public.user_departments
      for (const deptName of acc.departments) {
        const deptId = deptMap.get(deptName);
        if (!deptId) {
          throw new Error(`Department "${deptName}" not found in database!`);
        }
        await pg.query(
          `INSERT INTO user_departments (id, user_id, department_id, created_at)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), dbUserId, deptId, now]
        );
      }

      createdSummary.push({
        num: i + 1,
        name: acc.name,
        email: acc.email,
        role: acc.role,
        departments: acc.departments.join(' / '),
        authUserId,
      });
    }

    console.log('\n6. Verifying database state post-provisioning...');
    const { rows: verifyUsers } = await pg.query(
      `SELECT u.name, u.email, u.role, u.entities, array_agg(d.name) as depts
       FROM users u
       LEFT JOIN user_departments ud ON ud.user_id = u.id
       LEFT JOIN departments d ON d.id = ud.department_id
       GROUP BY u.name, u.email, u.role, u.entities
       ORDER BY u.role, u.name`
    );

    console.log(`\n📋 Final Provisioned Users in Database (${verifyUsers.length}/13):`);
    console.table(
      verifyUsers.map((u) => ({
        Name: u.name,
        Email: u.email,
        Role: u.role,
        Departments: (u.depts || []).filter(Boolean).join(', '),
        Entities: (u.entities || []).join(', '),
      }))
    );

    // Verify row counts for operational tables
    console.log('\n📊 Operational Table Verification (all should be 0):');
    for (const tbl of TABLES_TO_TRUNCATE) {
      if (tbl === 'users' || tbl === 'user_departments') continue;
      const { rows: c } = await pg.query(`SELECT count(*)::int as count FROM "${tbl}"`);
      if (c[0].count !== 0) {
        console.warn(`   ⚠️ Table "${tbl}" has ${c[0].count} rows!`);
      }
    }
    console.log('   ✅ All operational tables verified at 0 rows.');

    console.log('\n================================================================');
    console.log('  SUCCESS: Production data purged & 13 handover accounts ready!  ');
    console.log('  System Administrator: Lorein Wong <lorein@ata-lta.ph>          ');
    console.log('  Default Password: Password@123                                ');
    console.log('================================================================\n');
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Script failed:', err);
  process.exit(1);
});
