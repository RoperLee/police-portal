var express = require('express');
var router = express.Router();
var excelService = require('../service/excelService');

router.get('/operate/excel', excelService.operateExcel);

module.exports = router;
