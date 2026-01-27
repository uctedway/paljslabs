const path = require('path');

/**
 * 홈 인덱스 페이지
 */
const index = (req, res) => {
    res.render(path.join(__dirname, '../pages/index.ejs'));
};
const ping = (req, res) => {
    res.render(path.join(__dirname, '../pages/ping.ejs'));
};

module.exports = {
    index
};
