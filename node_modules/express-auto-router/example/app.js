var express = require('express');
var path = require('path');
var routerConfig = require('../index');

var app = express();
var port = 3000;


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

routerConfig(app, {
    dirPath: __dirname + '/routes/',
    map: {
        'index': '/'
    }
});

// static assets served by express.static() for production
app.use(express.static(path.join(__dirname, 'public')));


app.listen(port, function() {
    console.log('App (production) is now running on port 3000!');
});