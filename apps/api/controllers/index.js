const index = (req, res) => {
    res.json({
        status: 'success',
        message: 'API is running',
        version: '1.0.0'
    });
};

module.exports = {
    index
};