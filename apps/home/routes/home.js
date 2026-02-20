const express = require('express');
const router = express.Router();
const indexController = require('../controllers/index');

// GET /
router.get('/', indexController.index);
router.get('/ping', indexController.ping);
router.get('/terms', indexController.terms);
router.get('/privacy-policy', indexController.privacyPolicy);
router.get('/system-maintenance', indexController.systemMaintenance);

module.exports = router;
