var express = require('express');
var router = express.Router();
var firstService = require('../service/firstService');

router.get('/', firstService.serviceMethod);

module.exports = router;
