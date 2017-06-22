var express = require('express');
var router = express.Router();
var questionService = require('../service/questionService');

router.get('/addQuestion', questionService.addQuestion);

module.exports = router;
