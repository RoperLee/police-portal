var express = require('express');
var router = express.Router();

router.get('/another', function (req, res, next) {
    res.render('index', {title: 'Second-Express'});
});

module.exports = router;