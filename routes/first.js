var express = require('express');
var router = express.Router();
var firstService = require('../service/firstService');

router.get('/', firstService.serviceMethod);
router.get('/roper', firstService.serviceMethod);
router.get('/import/excel', firstService.importExcel);

module.exports = router;
