# Billing / Invoices Module

**Owner:** Agent B / Team B  
**Phase:** 5

## Endpoints

### Invoices

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/v1/invoices` | `billing:view` | List invoices |
| `POST` | `/v1/invoices` | `billing:edit` | Create invoice with line items |
| `GET` | `/v1/invoices/:id` | `billing:view` | Get invoice with items + payments |
| `PUT` | `/v1/invoices/:id` | `billing:edit` | Update invoice |
| `DELETE` | `/v1/invoices/:id` | `billing:delete` | Soft-delete invoice |
| `POST` | `/v1/invoices/:id/payments` | `billing:payments` | Record a payment |
| `GET` | `/v1/invoices/:id/pdf` | `billing:view` | Generate invoice PDF |
| `GET` | `/v1/invoices/:id/voucher` | `billing:view` | Generate payment voucher PDF |
| `GET` | `/v1/invoices/aging` | `billing:view` | Aging report |

### Billing Templates

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/v1/invoices/templates` | `billing:view` | List templates |
| `POST` | `/v1/invoices/templates` | `billing:templates` | Create template |
| `PUT` | `/v1/invoices/templates/:id` | `billing:templates` | Update template |
| `DELETE` | `/v1/invoices/templates/:id` | `billing:templates` | Delete template |

## Invoice Statuses

Draft → Sent → Partially Paid → Paid

## Payment Recording

When a payment is recorded:
- `amount_paid` increases by the payment amount
- `balance` = `total` - `amount_paid`
- If `balance` ≤ 0, status → `Paid`
- If `balance` > 0 and `amount_paid` > 0, status → `Partially Paid`

## Aging Buckets

| Bucket | Days Overdue |
|--------|-------------|
| Current | Not yet due |
| 1-30 | 1–30 days past due |
| 31-60 | 31–60 days past due |
| 61-90 | 61–90 days past due |
| 90+ | Over 90 days past due |

## PDF Storage

Generated PDFs use stable keys, with `entity_code` equal to `ATA` or `LTA`:

- Branded (the default): `entities/{entity_code}/invoices/{id}/pdf/{invoice_number}.pdf`
- Without company details/logo: `entities/{entity_code}/invoices/{id}/pdf/{invoice_number}-no-company-details.pdf`

Regenerating the same invoice and branding variant replaces the existing object through `uploadBuffer`'s `upsert: true`. The variants have separate keys so generating one cannot replace the other. The default branded key preserves the existing invoice-number filename contract.

### Statement print details and administrator corrections

Migration `000067_invoice_statement_details_admin_edit.js` adds invoice `print_details` (JSONB) and extends the existing atomic invoice update. Apply this migration before enabling the new billing statement editor. Administrators may correct released invoices; non-admin financial edits still require Draft. Version checks and row locking precede line-item mutation. Totals below recorded payments are rejected, and paid/partially-paid status follows recalculated balances.

`PATCH /invoices/:id` accepts admin-only `printDetails` fields `clientName`, `clientTin`, `paymentDate`, `cash`, `checkNumber`, `bankBranch`, `notedBy`, `preparedBy`, `receivedBy`, together with `expectedVersion`. These are statement snapshots, not payment ledger updates or changes to master clients. Empty strings deliberately clear printed fields.

`GET /invoices/:id/pdf?includeCompanyDetails=false` omits company name/logo and uses the generic statement layout. Omitting the parameter preserves branding. The PDF uses `statementDocument.js`, equivalent to the frontend statement builder; keep both renderers synchronized. Logos are embedded from backend assets. PDFs keep A4 padding and omit browser headers/footers, and each branding variant uses its documented stable storage key.

The regression suite is `tests/billing.statement.spec.js` alongside existing billing/address/OCC tests. Migration up/down and rejected-write rollback were additionally verified in a temporary PostgreSQL runtime; no remote database was changed during development.

### Invoice update HTTP 500 / address schema repair

Migration `000069_add_invoice_address_snapshot.js` adds the missing nullable `invoices.address` snapshot used by the transactional update function. The earlier billing schema did not create this column, so PostgreSQL raised `42703` on every update, including signature-only edits. NULL preserves the existing master-client address fallback; the migration does not change client records or invoice contents. Apply this migration after `000067` and `000068`.

`tests/integration/invoice-address-migration.test.js` exercises the original billing schema and actual invoice transaction function in an isolated PostgreSQL schema inside a rolled-back transaction. Set `BILLING_MIGRATION_TEST_DATABASE_URL` explicitly to run it. It verifies the original failure, idempotent repair, full inline/signature updates, snapshot-only address changes, and stale-write rejection.
