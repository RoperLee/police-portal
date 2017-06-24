/**
 * Created by roper on 2017/5/19.
 */
var ModelProxy = require('../lib/modelproxy');

exports.addQuestion = function (req, res, next) {
    var dataProxy = new ModelProxy({
        getAllSubject: 'get.all.subject'
    });
    dataProxy.getAllSubject({}).done(function (result) {
        res.render('question-page', {subjectList: result.object});
    }).error(function (err) {
        res.render('question-page', {});
    });
};

exports.getDirectoryListBySubjectId = function (req, res, next) {
    let subjectId = req.query.subjectId;
    let dataProxy = new ModelProxy({
        getDirectoryListBySubjectId: 'get.directory.list.by.subjectId'
    });
    dataProxy.getDirectoryListBySubjectId({
        subjectId: subjectId
    }).done(function (result) {
        res.json(result);
    }).error(function (err) {
        res.json({});
    });
};

