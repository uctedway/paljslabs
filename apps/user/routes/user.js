const express = require('express');
const router = express.Router();
const indexController = require('../controllers/index');

// GET /user
router.get('/', indexController.index);

// GET /user/login
router.get('/login', indexController.login);

// GET /user/register
router.get('/register', indexController.register);

module.exports = router;
