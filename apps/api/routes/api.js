const express = require('express');
const router = express.Router();
const indexController = require('../controllers/index');

// GET /api
router.get('/', indexController.index);


module.exports = router;
