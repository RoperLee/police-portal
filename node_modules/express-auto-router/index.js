/**
 *
 * @authors yuqiu (yuqiu@luojilab.com)
 * @date    2016-03-07 15:09:01
 * @version 0.4.0
 */
var path = require('path');
var readdirSync = require('./lib/readdirSync');
var routerConfig = function(app, options) {
	options.map = options.map || {};
	var files = readdirSync(options.dirPath);
	files.forEach(function(file) {
		var name = path.relative(options.dirPath, file).split('.')[0];
		var el =  options.map[name] || '/' + name;
		app.use(el, require(file));
	});
};

module.exports = routerConfig;
