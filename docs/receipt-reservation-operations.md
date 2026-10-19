# Receipt reservation storage and recovery

The store coordinates Node processes through an exclusive filesystem lock directory,
not through rename or timestamp caching. Each operation reloads the file under the
lock, writes a new file, fsyncs it, renames it and fsyncs the directory. Contention
returns HTTP 503 `RECEIPT_STORE_BUSY`; retry the same operation. Read, write,
rename, or sync failures return 503 `RECEIPT_STORE_IO_ERROR` instead of reporting
success with unpersisted memory state.

## Deployment requirement

Production must set `RESERVATION_STORE_PATH` to an absolute JSON file path on a
**durable shared volume used by every API worker and cleanup process for that
environment**. For example `/var/lib/erp/receipts/reservations.json`. The directory
must be writable only by the application account. The filesystem must support
atomic mkdir/rename and fsync. Separate replicas with separate filesystems are not
supported by this backend: use one shared volume or a database-backed store before
scaling across those hosts. Use separate volumes/paths per environment.

There is intentionally no production `/tmp` fallback. Without configuration,
receipt store requests fail closed and periodic cleanup does not start. The current
Render blueprint does not provision a durable disk; this document does not claim
that deployment has been configured. Development/test defaults remain temporary.
Back up the file consistently while application and cleanup writers are stopped.
Do not delete the file to clear an error or start multiple isolated production copies.

## Cleanup

`cd backend && npm run cleanup:receipts -- --dry-run` previews cleanup. Omit
`--dry-run` to execute it. Both commands require the same reservation path and
private storage/database configuration as the API. The API also runs cleanup every
15 minutes when configured. CLI exit status is nonzero if any object fails its
verification/deletion step. Failures remain retryable and appear in periodic logs.

Cleanup persists `deleting` before asynchronous database/storage calls. That state
cannot be completed, claimed or bound to a voucher. A successful database query
must establish that no voucher references the object before deletion. Database
errors, unavailable clients, malformed responses and storage errors retain the
record for retry. Existing voucher links become consumed records. Claimed records
are never automatically deleted or reassigned, regardless of age. Deletion is
idempotent and retryable after a process restart. Do not use direct database writes
to attach keys bypassing this protocol.

## Crash and ambiguous write recovery

Filesystem persistence and the voucher database are separate systems. A database
insert/update may commit even if receipt consumption subsequently fails or the HTTP
response is lost. The service keeps that claim reserved and does not delete the
voucher or restore a stale snapshot. Before retrying creation, inspect the voucher
list and reconcile the claim; a new upload/create could otherwise duplicate the
business operation. Automatic recovery based solely on elapsed time is unsafe.

For a leftover `.lock` directory or long-lived `claimed` record:

1. Stop **all** API workers, cleanup jobs and other store writers. Verify no old
   request can still commit. Do not remove a lock while an owner might be alive.
2. Back up the reservation JSON and inspect database vouchers by the exact
   `receipt_s3_key` and entity. An unavailable database is not proof of no link.
3. For a confirmed linked voucher, mark the record consumed with its voucher ID
   and timestamp. For a confirmed failed request with no link, return it to
   completed, removing claimId/claimedBy/claimedAt. Retain its original expiry;
   an expired record should be cleaned up, not silently renewed. If outcome is
   uncertain, keep it claimed and investigate.
4. Validate the JSON; write any repair with atomic replacement and fsync while
   writers remain stopped. Remove a stale lock only after confirming its owner
   cannot resume. Restart a single worker and verify before restoring concurrency.

Recovery is an operator action, not an automatically granted expiry lease. A corrupt
store, missing volume, or full disk must be repaired rather than bypassed with an
in-memory fallback.

## Verification

`receipt_store_safety.test.js` uses real local files and multiple child Node
processes sharing one path, tests one winner under contention, preserves unrelated
writes, checks database fail-closed behavior and injects filesystem failures.
`receipt_binding_failure.test.js` verifies committed vouchers survive failed receipt
consumption without releasing their claims. HTTP/database/storage assertions use
mocks; they do not establish live PostgreSQL or private storage acceptance.
