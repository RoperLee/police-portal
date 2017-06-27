var express = require('express');
var app = express();
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
var router = express.Router();
var questionService = require('../service/questionService');


router.get('/addQuestion', questionService.addQuestion);
router.get('/ajax/get/directory/list/by/subject/id', questionService.getDirectoryListBySubjectId);
router.get('/easy/add/questiond', questionService.easyAddQuestion);
router.post('/test/post/data',questionService.testPost);


module.exports = router;
