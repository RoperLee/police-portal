var express = require('express');
var router = express.Router();
var questionService = require('../service/questionService');


router.get('/addQuestion', questionService.addQuestion);
router.get('/ajax/get/directory/list/by/subject/id', questionService.getDirectoryListBySubjectId);


module.exports = router;
