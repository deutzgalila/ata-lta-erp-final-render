# Secret Rotation Runbook

**Last updated**: 2026-09-14

## Supabase Service Key Rotation

1. Generate a new service role key in Supabase dashboard → Settings → API.
2. Update the key in Render environment group (`erp-uat-secrets` or `erp-prod-secrets`).
3. Redeploy the affected Web Service.
4. Verify `/health` returns `supabase: true`.
5. Revoke the old key in Supabase.

## Backup Encryption Key Rotation

Pre-migration and scheduled database dumps are AES-256-encrypted with
`BACKUP_ENCRYPTION_KEY` and stored in the Supabase Storage bucket
`erp-db-backups`.

1. Generate a new strong passphrase: `openssl rand -base64 48`.
2. Update `BACKUP_ENCRYPTION_KEY` in GitHub → Settings → Secrets → Actions.
3. Re-run the backup workflow manually (`backup-prod.yml`) to verify.
4. Store the new passphrase in the team password manager.
5. Note: existing dumps remain encrypted with the previous key — keep the
   old passphrase retrievable until those dumps' retention lapses.

## Document Storage Access

Documents live in Supabase Storage (`documents` bucket); access is governed
by the Supabase service role key above. There are no separate storage
credentials to rotate — rotating the service key covers document access and
signed URL generation. After rotation, test document upload and download in
the SPA.

## GitHub Repository Secrets

1. Go to GitHub → Settings → Secrets and variables → Actions.
2. Update the affected secret.
3. Re-run the latest workflow to verify.

## Post-Rotation Checklist

- [ ] Health check passes.
- [ ] Smoke tests pass.
- [ ] No errors in Render logs.
- [ ] Old credentials are revoked/deleted.
