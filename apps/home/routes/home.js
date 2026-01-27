const express = require('express');
const router = express.Router();
const indexController = require('../controllers/index');

// GET /
router.get('/', indexController.index);
router.get('/ping', indexController.ping);

module.exports = router;
