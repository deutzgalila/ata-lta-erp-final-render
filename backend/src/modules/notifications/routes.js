/**
 * Notifications module routes.
 * Mounted at /v1/notifications by app.js.
 */

const express = require('express');
const router = express.Router();
const { notificationsController } = require('./controller');
const { auth } = require('../../middleware/auth');
const { entityScope } = require('../../middleware/entityScope');
const { resolveEntity } = require('../../middleware/resolveEntity');
const { requirePermission } = require('../../middleware/rbac');

router.use(auth, entityScope);

router.get(
  '/',
  resolveEntity({ allowAll: true }),
  requirePermission('notifications:view'),
  notificationsController.list
);

// CRITICAL: /read-all must be registered before /:id/read to prevent route shadowing
router.post(
  '/read-all',
  resolveEntity({ allowAll: true }),
  requirePermission('notifications:view'),
  notificationsController.markAllRead
);

router.post(
  '/:id/read',
  resolveEntity({ allowAll: true }),
  requirePermission('notifications:view'),
  notificationsController.markRead
);

module.exports = router;
