/**
 * Created by roper on 2017/5/19.
 */
var ModelProxy = require('../lib/modelproxy');

exports.addQuestion = function (req, res, next) {
    var dataProxy = new ModelProxy({
        getAllSubject: 'get.all.subject'
    });
    dataProxy.getAllSubject({}).done(function (result) {
        if (result.successful && result.object && result.object.length) {
            res.render('question_page', {subjectList: result.object});
        } else {
            res.render('question_page', {});
        }
    }).error(function (err) {
        res.render('question_page', {});
    });
};