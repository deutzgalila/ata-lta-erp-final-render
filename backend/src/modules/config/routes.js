/**
 * Configuration module routes.
 * Exposes /v1/config/public for runtime client initialization.
 */

const express = require('express');
const router = express.Router();
const { configController } = require('./controller');

router.get('/public', configController.getPublicConfig);

module.exports = router;
