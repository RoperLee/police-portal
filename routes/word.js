var express = require('express');
var router = express.Router();
var wordService = require('../service/wordService');

router.get('/operate/word', wordService.operateWord);

module.exports = router;
