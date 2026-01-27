const path = require('path');

/**
 * 유저 인덱스 페이지
 */
const index = (req, res) => {
    res.send('User Index');
};

/**
 * 로그인 페이지
 */
const login = (req, res) => {
    res.send('Login Page');
};

/**
 * 회원가입 페이지
 */
const register = (req, res) => {
    res.send('Register Page');
};

module.exports = {
    index,
    login,
    register
};
