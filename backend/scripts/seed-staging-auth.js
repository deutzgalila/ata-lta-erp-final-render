const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const envPath = path.join(__dirname, '..', '.env.staging');
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !serviceKey || !databaseUrl) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_KEY, and DATABASE_URL are required');
  process.exit(1);
}

const SEED_USERS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'dev-admin@ata-lta.ph',
    password: 'password123',
    name: 'Dev Administrator',
    role: 'Admin',
    entities: ['ATA', 'LTA']
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'dev-accs@ata-lta.ph',
    password: 'password123',
    name: 'Dev Accounting',
    role: 'Accounting',
    entities: ['ATA']
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'dev-docs@ata-lta.ph',
    password: 'password123',
    name: 'Dev Documentation',
    role: 'Manager',
    entities: ['ATA', 'LTA']
  }
];

async function run() {
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();

  try {
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error('Failed to list Supabase Auth users:', listError.message);
      process.exit(1);
    }

    const authUsers = listData?.users || [];

    for (const u of SEED_USERS) {
      let authUser = authUsers.find(au => au.email === u.email);
      if (!authUser) {
        console.log(`Creating user in Supabase Auth: ${u.email}...`);
        const { data: createData, error: createError } = await supabase.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true
        });

        if (createError) {
          console.error(`Failed to create ${u.email}:`, createError.message);
          continue;
        }

        authUser = createData.user;
        console.log(`Created ${u.email} with id: ${authUser.id}`);
      } else {
        console.log(`User ${u.email} already exists in Supabase Auth with id: ${authUser.id}`);
      }

      // Check if user exists in the local users table
      const { rows } = await pg.query('SELECT id, auth_user_id, email FROM users WHERE id = $1 OR email = $2', [u.id, u.email]);
      if (!rows.length) {
        console.log(`Inserting ${u.email} into database users table...`);
        await pg.query(
          'INSERT INTO users (id, auth_user_id, email, name, role, entities, is_active) VALUES ($1, $2, $3, $4, $5, $6, true)',
          [u.id, authUser.id, u.email, u.name, u.role, u.entities]
        );
        console.log(`Inserted ${u.email} successfully.`);
      } else {
        const dbUser = rows[0];
        const { rows: fullRows } = await pg.query('SELECT role FROM users WHERE id = $1', [dbUser.id]);
        const dbRole = fullRows[0]?.role;

        if (dbUser.email !== u.email || dbUser.auth_user_id !== authUser.id || dbRole !== u.role) {
          console.log(`Updating users table email/mapping/role for ${u.email}...`);
          await pg.query('UPDATE users SET email = $1, auth_user_id = $2, role = $3 WHERE id = $4', [u.email, authUser.id, u.role, dbUser.id]);
          console.log(`Updated users table mapping for ${u.email}`);
        } else {
          console.log(`Database mapping for ${u.email} is already correct.`);
        }
      }
    }
  } finally {
    await pg.end();
  }

  console.log('Auth seeding complete!');
}

run().catch(err => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
