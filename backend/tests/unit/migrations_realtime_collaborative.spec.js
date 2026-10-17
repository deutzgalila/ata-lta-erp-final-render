/**
 * Test Suite: Migration 000061 Enable Collaborative Realtime Publication
 *
 * Verifies that:
 * 1. Migration exports up and down handlers accepting `pgm`.
 * 2. UP migration SQL is wrapped in an idempotent DO $$ BEGIN ... END $$; block
 *    checking `pg_publication` for 'supabase_realtime' and guards each table addition
 *    via `pg_publication_tables` catalog queries before ALTER PUBLICATION:
 *    - operations_requests
 *    - notifications
 *    - transmittals
 *    - documents
 *    - task_assignees
 * 3. UP migration sets REPLICA IDENTITY FULL across all 9 collaborative tables:
 *    - work_requests
 *    - tasks
 *    - operations_requests
 *    - notifications
 *    - disbursements
 *    - invoices
 *    - transmittals
 *    - documents
 *    - task_assignees
 * 4. DOWN migration SQL is wrapped in an idempotent DO $$ BEGIN ... END $$; block
 *    checking `pg_publication` for 'supabase_realtime' and guards each table removal
 *    via `pg_publication_tables` catalog queries without invalid 'DROP TABLE IF EXISTS' grammar:
 *    - operations_requests
 *    - notifications
 *    - transmittals
 *    - documents
 *    - task_assignees
 *    while preserving the 4 base tables registered in migration 000060:
 *    - work_requests
 *    - tasks
 *    - disbursements
 *    - invoices
 * 5. Structural catalog guard verification ensures genuine SQL syntax and defensive checks.
 * 6. Live PostgreSQL engine verification (when database is available):
 *    - Clean execution and no publication errors when 'supabase_realtime' is absent.
 *    - Correct addition of 5 tables and REPLICA IDENTITY FULL on all 9 tables.
 *    - Strict idempotency of UP on repeated execution.
 *    - Correct removal of 5 tables on DOWN while preserving pre-existing tables.
 *    - Strict idempotency of DOWN on repeated execution.
 */

const { Client } = require('pg');
const migration = require('../../migrations/000061_enable_collaborative_realtime_publication');

const ADDED_TABLES = [
  'operations_requests',
  'notifications',
  'transmittals',
  'documents',
  'task_assignees',
];

const REPLICA_IDENTITY_TABLES = [
  'work_requests',
  'tasks',
  'operations_requests',
  'notifications',
  'disbursements',
  'invoices',
  'transmittals',
  'documents',
  'task_assignees',
];

const BASE_TABLES = ['work_requests', 'tasks', 'disbursements', 'invoices'];

describe('Migration 000061: enable_collaborative_realtime_publication', () => {
  let upSql = '';
  let downSql = '';

  beforeAll(() => {
    const mockPgmUp = {
      sql: (statement) => {
        upSql = statement;
      },
    };
    const mockPgmDown = {
      sql: (statement) => {
        downSql = statement;
      },
    };

    migration.up(mockPgmUp);
    migration.down(mockPgmDown);
  });

  describe('Module Contract & Exports', () => {
    it('exports up and down migration functions', () => {
      expect(typeof migration.up).toBe('function');
      expect(typeof migration.down).toBe('function');
    });

    it('invokes pgm.sql with non-empty SQL strings', () => {
      expect(typeof upSql).toBe('string');
      expect(upSql.trim().length).toBeGreaterThan(0);

      expect(typeof downSql).toBe('string');
      expect(downSql.trim().length).toBeGreaterThan(0);
    });
  });

  describe('UP Migration SQL Structure & Idempotency', () => {
    it('wraps execution in an idempotent PL/pgSQL DO block', () => {
      expect(upSql).toMatch(/DO\s+\$\$/i);
      expect(upSql).toMatch(/BEGIN/i);
      expect(upSql).toMatch(/END\s+\$\$;/i);
    });

    it('guards publication alteration by checking pg_publication for supabase_realtime', () => {
      expect(upSql).toMatch(
        /IF\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+pg_publication\s+WHERE\s+pubname\s*=\s*'supabase_realtime'\s*\)\s+THEN/i
      );
    });

    it('guards each of the 5 table additions with pg_publication_tables existence check', () => {
      for (const table of ADDED_TABLES) {
        const guardRegex = new RegExp(
          `IF\\s+NOT\\s+EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+pg_publication_tables\\s+WHERE\\s+pubname\\s*=\\s*'supabase_realtime'\\s+AND\\s+tablename\\s*=\\s*'${table}'\\s*\\)\\s+THEN\\s+ALTER\\s+PUBLICATION\\s+supabase_realtime\\s+ADD\\s+TABLE\\s+${table};\\s*END\\s+IF;`,
          'i'
        );
        expect(upSql).toMatch(guardRegex);
      }
    });

    it('adds all 5 newly collaborative tables to supabase_realtime publication', () => {
      for (const table of ADDED_TABLES) {
        const tableRegex = new RegExp(
          `ALTER\\s+PUBLICATION\\s+supabase_realtime\\s+ADD\\s+TABLE\\s+${table}\\s*;`,
          'i'
        );
        expect(upSql).toMatch(tableRegex);
      }
    });

    it('sets REPLICA IDENTITY FULL on all 9 collaborative tables', () => {
      for (const table of REPLICA_IDENTITY_TABLES) {
        const replicaRegex = new RegExp(
          `ALTER\\s+TABLE\\s+${table}\\s+REPLICA\\s+IDENTITY\\s+FULL\\s*;`,
          'i'
        );
        expect(upSql).toMatch(replicaRegex);
      }
    });

    it('does not touch column schemas, triggers, or constraints', () => {
      expect(upSql).not.toMatch(/DROP\s+TABLE/i);
      expect(upSql).not.toMatch(/DROP\s+COLUMN/i);
      expect(upSql).not.toMatch(/ADD\s+COLUMN/i);
      expect(upSql).not.toMatch(/TRIGGER/i);
      expect(upSql).not.toMatch(/CONSTRAINT/i);
    });
  });

  describe('DOWN Migration SQL Structure & Idempotency', () => {
    it('wraps execution in an idempotent PL/pgSQL DO block', () => {
      expect(downSql).toMatch(/DO\s+\$\$/i);
      expect(downSql).toMatch(/BEGIN/i);
      expect(downSql).toMatch(/END\s+\$\$;/i);
    });

    it('guards publication alteration by checking pg_publication for supabase_realtime', () => {
      expect(downSql).toMatch(
        /IF\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+pg_publication\s+WHERE\s+pubname\s*=\s*'supabase_realtime'\s*\)\s+THEN/i
      );
    });

    it('guards each table removal with pg_publication_tables existence check', () => {
      for (const table of ADDED_TABLES) {
        const guardRegex = new RegExp(
          `IF\\s+EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+pg_publication_tables\\s+WHERE\\s+pubname\\s*=\\s*'supabase_realtime'\\s+AND\\s+tablename\\s*=\\s*'${table}'\\s*\\)\\s+THEN\\s+ALTER\\s+PUBLICATION\\s+supabase_realtime\\s+DROP\\s+TABLE\\s+${table};\\s*END\\s+IF;`,
          'i'
        );
        expect(downSql).toMatch(guardRegex);
      }
    });

    it('drops all 5 added tables from supabase_realtime publication using valid syntax without IF EXISTS', () => {
      for (const table of ADDED_TABLES) {
        const dropRegex = new RegExp(
          `ALTER\\s+PUBLICATION\\s+supabase_realtime\\s+DROP\\s+TABLE\\s+${table}\\s*;`,
          'i'
        );
        expect(downSql).toMatch(dropRegex);
      }
    });

    it('does not drop pre-existing base tables (work_requests, tasks, disbursements, invoices) from publication', () => {
      for (const table of BASE_TABLES) {
        const dropBaseRegex = new RegExp(
          `ALTER\\s+PUBLICATION\\s+supabase_realtime\\s+DROP\\s+TABLE\\s+${table}\\s*;`,
          'i'
        );
        expect(downSql).not.toMatch(dropBaseRegex);
      }
    });

    it('does NOT contain illegal ALTER PUBLICATION ... DROP TABLE IF EXISTS grammar', () => {
      expect(downSql).not.toMatch(/ALTER\s+PUBLICATION\s+\w+\s+DROP\s+TABLE\s+IF\s+EXISTS/i);
      expect(downSql).not.toMatch(/DROP\s+TABLE\s+IF\s+EXISTS/i);
    });

    it('does not drop tables or columns from the database schema', () => {
      expect(downSql).not.toMatch(
        /DROP\s+TABLE\s+(?!operations_requests|notifications|transmittals|documents|task_assignees)/i
      );
      expect(downSql).not.toMatch(/(?<!ALTER\s+PUBLICATION\s+[^\s;]+\s+)DROP\s+TABLE/i);
      expect(downSql).not.toMatch(/ALTER\s+TABLE/i);
      expect(downSql).not.toMatch(/DROP\s+COLUMN/i);
    });
  });

  describe('Catalog Guard Structural Verification', () => {
    it('verifies UP migration queries pg_publication_tables for all 5 added tables', () => {
      for (const table of ADDED_TABLES) {
        const catalogCheckRegex = new RegExp(
          `SELECT\\s+1\\s+FROM\\s+pg_publication_tables\\s+WHERE\\s+pubname\\s*=\\s*'supabase_realtime'\\s+AND\\s+tablename\\s*=\\s*'${table}'`,
          'i'
        );
        expect(upSql).toMatch(catalogCheckRegex);
      }
    });

    it('verifies DOWN migration queries pg_publication_tables for all 5 added tables', () => {
      for (const table of ADDED_TABLES) {
        const catalogCheckRegex = new RegExp(
          `SELECT\\s+1\\s+FROM\\s+pg_publication_tables\\s+WHERE\\s+pubname\\s*=\\s*'supabase_realtime'\\s+AND\\s+tablename\\s*=\\s*'${table}'`,
          'i'
        );
        expect(downSql).toMatch(catalogCheckRegex);
      }
    });

    it('verifies conditional logic uses NOT EXISTS for ADD and EXISTS for DROP', () => {
      for (const table of ADDED_TABLES) {
        expect(upSql).toMatch(
          new RegExp(`IF\\s+NOT\\s+EXISTS[\\s\\S]*?tablename\\s*=\\s*'${table}'[\\s\\S]*?ADD\\s+TABLE\\s+${table}`, 'i')
        );
        expect(downSql).toMatch(
          new RegExp(`IF\\s+EXISTS[\\s\\S]*?tablename\\s*=\\s*'${table}'[\\s\\S]*?DROP\\s+TABLE\\s+${table}`, 'i')
        );
      }
    });

    it('verifies exact count of publication table modifications', () => {
      const upAdds = upSql.match(/ALTER\s+PUBLICATION\s+supabase_realtime\s+ADD\s+TABLE/gi) || [];
      expect(upAdds.length).toBe(ADDED_TABLES.length);

      const downDrops = downSql.match(/ALTER\s+PUBLICATION\s+supabase_realtime\s+DROP\s+TABLE/gi) || [];
      expect(downDrops.length).toBe(ADDED_TABLES.length);

      const replicaIdentities = upSql.match(/ALTER\s+TABLE\s+\w+\s+REPLICA\s+IDENTITY\s+FULL/gi) || [];
      expect(replicaIdentities.length).toBe(REPLICA_IDENTITY_TABLES.length);
    });
  });

  describe('Live PostgreSQL Engine Verification (conditional)', () => {
    let client;
    let dbConnected = false;
    const testSchema = `test_collab_migration_${Date.now()}`;
    let pubOriginallyExisted = false;

    beforeAll(async () => {
      const connectionString =
        process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

      try {
        client = new Client({ connectionString, connectionTimeoutMillis: 2000 });
        await client.connect();
        dbConnected = true;

        // Wait for any concurrent migration test (like migration 60) to complete its run
        for (let i = 0; i < 50; i++) {
          const activeMigration = await client.query(
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'test_realtime_migration_%'"
          );
          if (activeMigration.rows.length === 0) break;
          await new Promise((r) => setTimeout(r, 100));
        }

        const checkPub = await client.query(
          "SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'"
        );
        pubOriginallyExisted = checkPub.rows.length > 0;

        await client.query(`CREATE SCHEMA ${testSchema}`);
        await client.query(`SET search_path TO ${testSchema}, public`);

        // Create dummy tables in the test schema for all 9 collaborative tables
        for (const tbl of REPLICA_IDENTITY_TABLES) {
          await client.query(
            `CREATE TABLE ${testSchema}.${tbl} (id uuid PRIMARY KEY DEFAULT gen_random_uuid());`
          );
        }

        // Acquire exclusive publication lock inside transaction to serialize with concurrent test suites
        await client.query('BEGIN');
        await client.query('LOCK TABLE pg_publication IN ACCESS EXCLUSIVE MODE');
      } catch (_err) {
        dbConnected = false;
      }
    });

    afterAll(async () => {
      if (client && dbConnected) {
        try {
          await client.query('COMMIT');
        } catch (_err) {
          try {
            await client.query('ROLLBACK');
          } catch (_e) {
            // ignore rollback error
          }
        }
        try {
          if (!pubOriginallyExisted) {
            await client.query('DROP PUBLICATION IF EXISTS supabase_realtime');
          }
        } catch (_err) {
          // ignore cleanup errors
        }
        try {
          await client.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
        } catch (_err) {
          // ignore cleanup errors
        } finally {
          await client.end();
        }
      }
    });

    it('executes UP migration cleanly when publication does not exist in PostgreSQL (sets replica identity)', async () => {
      if (!dbConnected) return;

      await client.query('DROP PUBLICATION IF EXISTS supabase_realtime');
      await expect(client.query(upSql)).resolves.not.toThrow();

      const pubCheck = await client.query(
        "SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'"
      );
      expect(pubCheck.rows.length).toBe(0);

      // Verify REPLICA IDENTITY FULL was set on all 9 tables
      const res = await client.query(
        `SELECT c.relname, c.relreplident
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname = ANY($2)`,
        [testSchema, REPLICA_IDENTITY_TABLES]
      );
      expect(res.rows.length).toBe(REPLICA_IDENTITY_TABLES.length);
      for (const row of res.rows) {
        expect(row.relreplident).toBe('f');
      }
    });

    it('executes DOWN migration cleanly as a no-op when publication does not exist in PostgreSQL', async () => {
      if (!dbConnected) return;

      await client.query('DROP PUBLICATION IF EXISTS supabase_realtime');
      await expect(client.query(downSql)).resolves.not.toThrow();

      const pubCheck = await client.query(
        "SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'"
      );
      expect(pubCheck.rows.length).toBe(0);
    });

    it('adds 5 tables to supabase_realtime publication and sets REPLICA IDENTITY FULL on first UP execution', async () => {
      if (!dbConnected) return;

      // Create publication and register base tables (mimicking migration 000060 state)
      await client.query('CREATE PUBLICATION supabase_realtime');
      for (const baseTbl of BASE_TABLES) {
        await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE ${testSchema}.${baseTbl}`);
      }

      await expect(client.query(upSql)).resolves.not.toThrow();

      const res = await client.query(
        "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'"
      );
      const registeredTables = res.rows.map((r) => r.tablename);

      // All 5 added tables must be in publication
      for (const table of ADDED_TABLES) {
        expect(registeredTables).toContain(table);
      }

      // Base tables must remain in publication
      for (const table of BASE_TABLES) {
        expect(registeredTables).toContain(table);
      }

      // Verify REPLICA IDENTITY FULL ('f') on all 9 tables
      const replicaRes = await client.query(
        `SELECT c.relname, c.relreplident
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname = ANY($2)`,
        [testSchema, REPLICA_IDENTITY_TABLES]
      );
      expect(replicaRes.rows.length).toBe(REPLICA_IDENTITY_TABLES.length);
      for (const row of replicaRes.rows) {
        expect(row.relreplident).toBe('f');
      }
    });

    it('is strictly idempotent on repeated UP migration execution (second run executes with 0 errors)', async () => {
      if (!dbConnected) return;

      // Second UP execution must succeed without 42710 error
      await expect(client.query(upSql)).resolves.not.toThrow();

      const res = await client.query(
        "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'"
      );
      const registeredTables = res.rows.map((r) => r.tablename);

      for (const table of ADDED_TABLES) {
        expect(registeredTables).toContain(table);
      }
      expect(registeredTables.length).toBe(REPLICA_IDENTITY_TABLES.length);
    });

    it('removes 5 added tables from supabase_realtime publication on DOWN while preserving base tables', async () => {
      if (!dbConnected) return;

      await expect(client.query(downSql)).resolves.not.toThrow();

      const res = await client.query(
        "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'"
      );
      const registeredTables = res.rows.map((r) => r.tablename);

      // 5 added tables must no longer be in publication
      for (const table of ADDED_TABLES) {
        expect(registeredTables).not.toContain(table);
      }

      // 4 base tables must still be in publication
      for (const table of BASE_TABLES) {
        expect(registeredTables).toContain(table);
      }
      expect(registeredTables.length).toBe(BASE_TABLES.length);
    });

    it('is strictly idempotent on repeated DOWN migration execution (second run executes with 0 errors)', async () => {
      if (!dbConnected) return;

      // Second DOWN execution must succeed without syntax or relation error
      await expect(client.query(downSql)).resolves.not.toThrow();

      const res = await client.query(
        "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'"
      );
      const registeredTables = res.rows.map((r) => r.tablename);

      for (const table of ADDED_TABLES) {
        expect(registeredTables).not.toContain(table);
      }
      expect(registeredTables.length).toBe(BASE_TABLES.length);
    });
  });
});
