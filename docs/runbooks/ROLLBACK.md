# Rollback Runbook

**Last updated**: 2026-09-14

## Application Rollback

### Render Web Service

1. Go to the Render dashboard → select the affected service.
2. Click **Manual Deploy** → select the last known good commit.
3. Verify `/livez` returns `200` and `/readyz` reports dependencies ready.

### Alternative: Git Revert

```bash
git revert HEAD
git push origin uat  # or main for production
```

Render will auto-deploy the reverted commit.

## Database Rollback

### Using Migration Rollback

Migrations are applied by the custom runner (`backend/scripts/migrate-remote.js`), which is forward-only. To roll back, apply the failing migration's `down` SQL manually against a **non-production** clone first, then run it against production as plain SQL:

```bash
# Locate the migration's down block
ls backend/migrations/0000XX_*.js

# Apply its SQL manually
psql "$DATABASE_URL" -f rollback.sql
```

### Using Backup Restore

Database backups are AES-256/GPG-encrypted SQL dumps stored in the private
Supabase Storage bucket `erp-db-backups` (see `backup-prod.yml`). They are no
longer GitHub Actions artifacts.

1. Download the latest encrypted dump from the bucket:

```bash
supabase storage cp "ss:///erp-db-backups/backup-before-migration-YYYYMMDD-HHMMSS.sql.gpg" ./backup.sql.gpg
```

2. Decrypt with the backup encryption key (`BACKUP_ENCRYPTION_KEY` secret):

```bash
gpg --batch --yes --passphrase "$BACKUP_ENCRYPTION_KEY" -o backup.sql -d backup.sql.gpg
```

3. Restore:

```bash
psql "$DATABASE_URL" < backup.sql
```

### Using Supabase Point-in-Time Recovery

1. Go to Supabase dashboard → Database → Backups.
2. Select a point-in-time before the failed migration.
3. Restore to a new project, then swap connection strings.

## Document (Supabase Storage) Rollback

Documents live in the Supabase Storage `documents` bucket. To restore a
previous archived version over the active tree, use the Supabase CLI:

```bash
supabase storage cp -r "ss:///documents/archive/<version>" "ss:///documents/active"
```

For single-object restores, download the archived object and re-upload it at
the active path, then verify the SPA can preview and download it.

## Verification

After any rollback:

- [ ] `/health` returns `ok` with `supabase: true` and `storage: true`.
- [ ] SPA loads and authenticates successfully.
- [ ] Smoke tests pass.
