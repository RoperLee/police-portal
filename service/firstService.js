/**
 * Created by roper on 2017/5/19.
 */
var ModelProxy = require('../lib/modelproxy');

exports.serviceMethod = function (req, res, next) {
    var query = req.query.id;
    var dataProxy = new ModelProxy({
        healthCheck: 'Health.check.for.project'
    });
    dataProxy.healthCheck({
        query: query
    }).done(function (result) {
        res.render('index', {title: result.object.name});
    }).error(function (err) {
        res.render('index', {title: err});
    });
};