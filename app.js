var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var routerConfig = require('express-auto-router/index');
var cors = require('cors');

var ModelProxy = require('./lib/modelproxy');
ModelProxy.init('./interface.json');

var app = express();
app.use(cors())

routerConfig(app, {
    dirPath: __dirname + '/routes/',
    map: {
        'index': '/'
    }
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'xtpl');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'build')));
app.use(express.static(path.join(__dirname, 'bower_components')));

module.exports = app;
