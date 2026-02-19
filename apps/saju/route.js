const express = require('express');
const router = express.Router();
const sajuController = require('./controller');

// GET /
router.get('/', sajuController.index);
router.get('/result/:resultId', sajuController.result);
router.get('/shared/:shareToken', sajuController.sharedResult);

module.exports = router;
