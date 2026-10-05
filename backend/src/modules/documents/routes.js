/**
 * Documents module routes.
 * Mounted at /v1/documents by app.js.
 *
 * Phase 3 — Agent B
 */

const express = require('express');
const router = express.Router();
const { documentsController } = require('./controller');
const { requirePermission } = require('../../middleware/rbac');
const { audit } = require('../../middleware/audit');
const { resolveEntity } = require('../../middleware/resolveEntity');

// --- Listing and Read Endpoints (allowAll: true) ---
router.get(
  '/counts',
  resolveEntity({ allowAll: true }),
  requirePermission('dms:view'),
  documentsController.getDocumentCounts
);
router.get(
  '/',
  resolveEntity({ allowAll: true }),
  requirePermission('dms:view'),
  documentsController.listDocuments
);
router.get(
  '/:id',
  resolveEntity({ allowAll: true }),
  requirePermission('dms:view'),
  documentsController.getDocument
);

// Resolve entity code → UUID for all remaining mutation routes in this module
router.use(resolveEntity());

// Create document metadata + get upload URL
router.post(
  '/',
  requirePermission([
    'dms:edit',
    'workflow:task_upload',
    'disbursement:create',
    'disbursement:edit',
    'disbursement:request',
    'billing:create',
    'billing:edit',
    'billing:request',
  ]),
  audit('document.create', { table: 'documents' }),
  documentsController.createDocument
);

// Update document metadata
router.put(
  '/:id',
  requirePermission('dms:edit'),
  audit('document.update', { table: 'documents' }),
  documentsController.updateDocument
);

// Archive document
router.post(
  '/:id/archive',
  requirePermission('dms:edit'),
  audit('document.archive', { table: 'documents' }),
  documentsController.archiveDocument
);

// Unarchive document
router.post(
  '/:id/unarchive',
  requirePermission('dms:edit'),
  audit('document.unarchive', { table: 'documents' }),
  documentsController.unarchiveDocument
);

// Soft-delete document
router.delete(
  '/:id',
  requirePermission('dms:delete'),
  audit('document.delete', { table: 'documents' }),
  documentsController.deleteDocument
);

// Confirm storage upload completed
router.post(
  '/:id/confirm-upload',
  requirePermission([
    'dms:edit',
    'workflow:task_upload',
    'disbursement:create',
    'disbursement:edit',
    'disbursement:request',
    'billing:create',
    'billing:edit',
    'billing:request',
  ]),
  audit('document.confirm-upload', { table: 'documents' }),
  documentsController.confirmUpload
);

// Get signed download URL
router.get('/:id/download-url', requirePermission('dms:view'), documentsController.getDownloadUrl);

// Transition lifecycle state
router.put(
  '/:id/lifecycle',
  requirePermission('dms:handover'),
  audit('document.lifecycle', { table: 'documents' }),
  documentsController.updateLifecycle
);

module.exports = router;
