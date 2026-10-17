/**
 * Time Entries module routes.
 * Mounted at /v1/time-entries by app.js.
 */

const express = require('express');
const router = express.Router();
const { timeEntriesController } = require('./controller');
const { auth } = require('../../middleware/auth');
const { entityScope } = require('../../middleware/entityScope');
const { resolveEntity } = require('../../middleware/resolveEntity');
const { requirePermission } = require('../../middleware/rbac');

router.use(auth, entityScope);
router.use(resolveEntity({ allowAll: true }));

router.post(
  '/',
  requirePermission('timelog:create'),
  timeEntriesController.create
);

// CRITICAL: /summary must be registered before /:id routes to avoid route shadowing
router.get(
  '/summary',
  requirePermission('timelog:view'),
  timeEntriesController.summary
);

router.get(
  '/',
  requirePermission('timelog:view'),
  timeEntriesController.list
);

router.patch(
  '/:id',
  requirePermission(['timelog:edit_own', 'timelog:edit_all']),
  timeEntriesController.update
);

router.delete(
  '/:id',
  requirePermission(['timelog:edit_own', 'timelog:edit_all']),
  timeEntriesController.deleteEntry
);

module.exports = router;
