/**
 * Created by roper on 2017/5/19.
 */
var ModelProxy = require('../lib/modelproxy');
var textract = require('textract');

exports.operateWord = function (req, res, next) {
    textract.fromFileWithPath('/Users/roper/Downloads/文档.pdf', function (error, text) {
        res.render('word', {text: text});
    });
};