# Migration Failure Runbook

**Last updated**: 2026-09-14

> Migrations are applied by the custom runner `backend/scripts/migrate-remote.js`
> (`npm run migrate:remote:local` / `migrate:remote:prod`), which reads
> `backend/.env.<env>` and applies `.js`/`.sql` files in numeric order. CI never
> touches the production database; deploy pipelines apply migrations via this
> runner against the target environment.

## Diagnosis

### 1. Check the CI/CD logs

- Go to GitHub Actions → find the failed workflow run.
- Read the migration step output for the specific error.

### 2. Common Failure Causes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `relation already exists` | Migration ran partially before | Apply idempotent SQL (`IF NOT EXISTS`), or fix forward with a corrective migration |
| `permission denied` | Wrong `DATABASE_URL` or missing privileges | Verify secrets in Render env group |
| `connection refused` | Database not reachable | Check Supabase status; verify connection string |
| `syntax error` | Bug in migration SQL | Fix the SQL and push a corrected migration |
| `timeout` | Long-running migration on large table | Add `SET statement_timeout = '0';` at top of migration |
| `function does not exist` | RPC signature drift | Check the migration's `DROP FUNCTION IF EXISTS` covers old signatures (pass an explicit argument-name list when overloading) |

### 3. Check Migration State

The runner records applied migrations in the schema's migration tracking
table; inspect it against the target database:

```bash
psql "$DATABASE_URL" -c "SELECT * FROM pgmigrations ORDER BY run_on DESC LIMIT 10;"
```

## Recovery

### Option A: Fix Forward (preferred)

1. Write a new migration that corrects the issue.
2. Validate the full chain against a local ephemeral PostgreSQL (never the
   live database):

```bash
initdb -D /tmp/pgtest/data -U test_user --auth=trust
pg_ctl -D /tmp/pgtest/data -o "-p 55433 -k /tmp" -l /tmp/pgtest/log start
createdb -h localhost -p 55433 -U test_user erp_test_db
DATABASE_URL=postgres://test_user@localhost:55433/erp_test_db \
  node backend/scripts/migrate-remote.js local
```

3. Push and let the deploy pipeline apply it.

### Option B: Rollback

The runner is forward-only; there is no `migrate:down`. Apply the failing
migration's `down` SQL manually — against a non-production clone first — per
ROLLBACK.md.

### Option C: Restore from Backup

Pre-migration backups are GPG-encrypted dumps in the Supabase Storage bucket
`erp-db-backups` (not GitHub artifacts). Decrypt and restore per ROLLBACK.md.

## Prevention

- Validate the complete migration chain against a local ephemeral PostgreSQL
  before opening a PR (recipe above).
- Never edit a migration after it has been merged into `uat` or `main`.
- Use transactions in migrations when possible.
- Keep `pgm.sql` DDL idempotent (`IF NOT EXISTS`, `DROP ... IF EXISTS`) where
  feasible so a partial run can be re-applied safely.
