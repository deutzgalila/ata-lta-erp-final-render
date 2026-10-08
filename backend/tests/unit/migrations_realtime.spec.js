/**
 * Test Suite: Migration 000060 Supabase Realtime Publication
 *
 * Verifies that:
 * 1. Migration exports up and down handlers accepting `pgm`.
 * 2. UP migration SQL is wrapped in an idempotent DO $$ BEGIN ... END $$; block
 *    checking `pg_publication` for 'supabase_realtime' and guards each table addition
 *    via `pg_publication_tables` catalog queries before ALTER PUBLICATION:
 *    - work_requests
 *    - tasks
 *    - disbursements
 *    - invoices
 * 3. DOWN migration SQL is wrapped in an idempotent DO $$ BEGIN ... END $$; block
 *    checking `pg_publication` for 'supabase_realtime' and guards each table removal
 *    via `pg_publication_tables` catalog queries without invalid 'DROP TABLE IF EXISTS' grammar:
 *    - work_requests
 *    - tasks
 *    - disbursements
 *    - invoices
 * 4. Structural catalog guard verification ensures genuine SQL syntax and defensive checks.
 * 5. Live PostgreSQL engine verification (when database is available):
 *    - Graceful no-op when 'supabase_realtime' is absent for both UP and DOWN.
 *    - Correct addition and idempotency of UP on repeated execution.
 *    - Correct removal and idempotency of DOWN on repeated execution.
 */

const { Client } = require('pg');
const migration = require('../../migrations/000060_enable_supabase_realtime_publication');

const EXPECTED_TABLES = ['work_requests', 'tasks', 'disbursements', 'invoices'];

describe('Migration 000060: enable_supabase_realtime_publication', () => {
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

    it('guards each table addition with pg_publication_tables existence check', () => {
      for (const table of EXPECTED_TABLES) {
        const guardRegex = new RegExp(
          `IF\\s+NOT\\s+EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+pg_publication_tables\\s+WHERE\\s+pubname\\s*=\\s*'supabase_realtime'\\s+AND\\s+tablename\\s*=\\s*'${table}'\\s*\\)\\s+THEN\\s+ALTER\\s+PUBLICATION\\s+supabase_realtime\\s+ADD\\s+TABLE\\s+${table};\\s*END\\s+IF;`,
          'i'
        );
        expect(upSql).toMatch(guardRegex);
      }
    });

    it('adds all 4 target tables to supabase_realtime publication', () => {
      for (const table of EXPECTED_TABLES) {
        const tableRegex = new RegExp(
          `ALTER\\s+PUBLICATION\\s+supabase_realtime\\s+ADD\\s+TABLE\\s+${table}\\s*;`,
          'i'
        );
        expect(upSql).toMatch(tableRegex);
      }
    });

    it('does not touch table schemas, columns, triggers, or constraints', () => {
      expect(upSql).not.toMatch(/ALTER\s+TABLE/i);
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
      for (const table of EXPECTED_TABLES) {
        const guardRegex = new RegExp(
          `IF\\s+EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+pg_publication_tables\\s+WHERE\\s+pubname\\s*=\\s*'supabase_realtime'\\s+AND\\s+tablename\\s*=\\s*'${table}'\\s*\\)\\s+THEN\\s+ALTER\\s+PUBLICATION\\s+supabase_realtime\\s+DROP\\s+TABLE\\s+${table};\\s*END\\s+IF;`,
          'i'
        );
        expect(downSql).toMatch(guardRegex);
      }
    });

    it('drops all 4 target tables from supabase_realtime publication using valid syntax without IF EXISTS', () => {
      for (const table of EXPECTED_TABLES) {
        const dropRegex = new RegExp(
          `ALTER\\s+PUBLICATION\\s+supabase_realtime\\s+DROP\\s+TABLE\\s+${table}\\s*;`,
          'i'
        );
        expect(downSql).toMatch(dropRegex);
      }
    });

    it('does NOT contain illegal ALTER PUBLICATION ... DROP TABLE IF EXISTS grammar', () => {
      expect(downSql).not.toMatch(/ALTER\s+PUBLICATION\s+\w+\s+DROP\s+TABLE\s+IF\s+EXISTS/i);
      expect(downSql).not.toMatch(/DROP\s+TABLE\s+IF\s+EXISTS/i);
    });

    it('does not drop tables or columns from the database schema', () => {
      expect(downSql).not.toMatch(/DROP\s+TABLE\s+(?!work_requests|tasks|disbursements|invoices)/i);
      expect(downSql).not.toMatch(/ALTER\s+TABLE/i);
      expect(downSql).not.toMatch(/DROP\s+COLUMN/i);
    });
  });

  describe('Catalog Guard Structural Verification', () => {
    it('verifies UP migration queries pg_publication_tables for all 4 expected tables', () => {
      for (const table of EXPECTED_TABLES) {
        const catalogCheckRegex = new RegExp(
          `SELECT\\s+1\\s+FROM\\s+pg_publication_tables\\s+WHERE\\s+pubname\\s*=\\s*'supabase_realtime'\\s+AND\\s+tablename\\s*=\\s*'${table}'`,
          'i'
        );
        expect(upSql).toMatch(catalogCheckRegex);
      }
    });

    it('verifies DOWN migration queries pg_publication_tables for all 4 expected tables', () => {
      for (const table of EXPECTED_TABLES) {
        const catalogCheckRegex = new RegExp(
          `SELECT\\s+1\\s+FROM\\s+pg_publication_tables\\s+WHERE\\s+pubname\\s*=\\s*'supabase_realtime'\\s+AND\\s+tablename\\s*=\\s*'${table}'`,
          'i'
        );
        expect(downSql).toMatch(catalogCheckRegex);
      }
    });

    it('verifies conditional logic uses NOT EXISTS for ADD and EXISTS for DROP', () => {
      for (const table of EXPECTED_TABLES) {
        expect(upSql).toMatch(
          new RegExp(`IF\\s+NOT\\s+EXISTS[\\s\\S]*?tablename\\s*=\\s*'${table}'[\\s\\S]*?ADD\\s+TABLE\\s+${table}`, 'i')
        );
        expect(downSql).toMatch(
          new RegExp(`IF\\s+EXISTS[\\s\\S]*?tablename\\s*=\\s*'${table}'[\\s\\S]*?DROP\\s+TABLE\\s+${table}`, 'i')
        );
      }
    });
  });

  describe('Live PostgreSQL Engine Verification (conditional)', () => {
    let client;
    let dbConnected = false;
    const testSchema = `test_realtime_migration_${Date.now()}`;
    let pubOriginallyExisted = false;

    beforeAll(async () => {
      const connectionString =
        process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

      try {
        client = new Client({ connectionString, connectionTimeoutMillis: 2000 });
        await client.connect();
        dbConnected = true;

        const checkPub = await client.query(
          "SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'"
        );
        pubOriginallyExisted = checkPub.rows.length > 0;

        await client.query(`CREATE SCHEMA ${testSchema}`);
        await client.query(`SET search_path TO ${testSchema}, public`);

        // Create dummy tables in the test schema
        for (const tbl of EXPECTED_TABLES) {
          await client.query(
            `CREATE TABLE ${testSchema}.${tbl} (id uuid PRIMARY KEY DEFAULT gen_random_uuid());`
          );
        }
      } catch (_err) {
        dbConnected = false;
      }
    });

    afterAll(async () => {
      if (client && dbConnected) {
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

    it('executes UP migration cleanly as a no-op when publication does not exist in PostgreSQL', async () => {
      if (!dbConnected) return;

      await client.query('DROP PUBLICATION IF EXISTS supabase_realtime');
      await expect(client.query(upSql)).resolves.not.toThrow();

      const pubCheck = await client.query(
        "SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'"
      );
      expect(pubCheck.rows.length).toBe(0);
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

    it('adds tables to supabase_realtime publication on first UP migration execution', async () => {
      if (!dbConnected) return;

      await client.query('CREATE PUBLICATION supabase_realtime');

      await expect(client.query(upSql)).resolves.not.toThrow();

      const res = await client.query(
        "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'"
      );
      const registeredTables = res.rows.map((r) => r.tablename);

      for (const table of EXPECTED_TABLES) {
        expect(registeredTables).toContain(table);
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

      for (const table of EXPECTED_TABLES) {
        expect(registeredTables).toContain(table);
      }
      expect(registeredTables.length).toBe(EXPECTED_TABLES.length);
    });

    it('removes tables from supabase_realtime publication on first DOWN migration execution', async () => {
      if (!dbConnected) return;

      await expect(client.query(downSql)).resolves.not.toThrow();

      const res = await client.query(
        "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'"
      );
      expect(res.rows.length).toBe(0);
    });

    it('is strictly idempotent on repeated DOWN migration execution (second run executes with 0 errors)', async () => {
      if (!dbConnected) return;

      // Second DOWN execution must succeed without syntax or relation error
      await expect(client.query(downSql)).resolves.not.toThrow();

      const res = await client.query(
        "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'"
      );
      expect(res.rows.length).toBe(0);
    });
  });
});
