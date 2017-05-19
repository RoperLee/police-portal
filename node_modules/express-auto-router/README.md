# auto-router
自动生成express框架的路由机制


# 使用方式

````
var express = require('express');
var path = require('path');
var routerConfig = require('../index');
var app = express();

routerConfig(app, {
    dirPath: __dirname + '/routes/',
    map: {
        'index': '/'
    }
});

````

会自动读取dirPath目录下面的所有js，根据文件名称生成对应的路由名称，例如：index.js 里面的 就变成 /index/*，以此类推。

为了解决一些特别路由，添加了map机制，如例子展示，这里会把 /index/ => / 这种形式， 也就是一个对应关系。

如果是为了代理可以这么配置 'api': '/api/*';