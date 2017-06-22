(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*!
 * escape-html
 * Copyright(c) 2012-2013 TJ Holowaychuk
 * Copyright(c) 2015 Andreas Lubbe
 * Copyright(c) 2015 Tiancheng "Timothy" Gu
 * MIT Licensed
 */

'use strict';

/**
 * Module variables.
 * @private
 */

var matchHtmlRegExp = /["'&<>]/;

/**
 * Module exports.
 * @public
 */

module.exports = escapeHtml;

/**
 * Escape special characters in the given string of html.
 *
 * @param  {string} string The string to escape for inserting into HTML
 * @return {string}
 * @public
 */

function escapeHtml(string) {
  var str = '' + string;
  var match = matchHtmlRegExp.exec(str);

  if (!match) {
    return str;
  }

  var escape;
  var html = '';
  var index = 0;
  var lastIndex = 0;

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escape = '&quot;';
        break;
      case 38: // &
        escape = '&amp;';
        break;
      case 39: // '
        escape = '&#39;';
        break;
      case 60: // <
        escape = '&lt;';
        break;
      case 62: // >
        escape = '&gt;';
        break;
      default:
        continue;
    }

    if (lastIndex !== index) {
      html += str.substring(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index
    ? html + str.substring(lastIndex, index)
    : html;
}

},{}],2:[function(require,module,exports){
'use strict';

/**
 * translate ast to js function code
 */

var XTemplateRuntime = require('./runtime');
var parser = require('./compiler/parser');
parser.yy = require('./compiler/ast');
var util = XTemplateRuntime.util;
var nativeCommands = XTemplateRuntime.nativeCommands;
var nativeUtils = XTemplateRuntime.utils;

var compilerTools = require('./compiler/tools');
var pushToArray = compilerTools.pushToArray;
var wrapByDoubleQuote = compilerTools.wrapByDoubleQuote;
var convertIdPartsToRawAccessor = compilerTools.convertIdPartsToRawAccessor;
var wrapBySingleQuote = compilerTools.wrapBySingleQuote;
var escapeString = compilerTools.escapeString;
var chainedVariableRead = compilerTools.chainedVariableRead;
// codeTemplates --------------------------- start

var TMP_DECLARATION = ['var t;'];
for (var i = 0; i < 10; i++) {
  TMP_DECLARATION.push('var t' + i + ';');
}
var TOP_DECLARATION = TMP_DECLARATION.concat(['var tpl = this;\n  var root = tpl.root;\n  var buffer = tpl.buffer;\n  var scope = tpl.scope;\n  var runtime = tpl.runtime;\n  var name = tpl.name;\n  var pos = tpl.pos;\n  var data = scope.data;\n  var affix = scope.affix;\n  var nativeCommands = root.nativeCommands;\n  var utils = root.utils;']).join('\n');
var CALL_NATIVE_COMMAND = '{lhs} = {name}Command.call(tpl, scope, {option}, buffer);';
var CALL_CUSTOM_COMMAND = 'buffer = callCommandUtil(tpl, scope, {option}, buffer, {idParts});';
var CALL_FUNCTION = '{lhs} = callFnUtil(tpl, scope, {option}, buffer, {idParts});';
var CALL_DATA_FUNCTION = '{lhs} = callDataFnUtil([{params}], {idParts});';
var CALL_FUNCTION_DEPTH = '{lhs} = callFnUtil(tpl, scope, {option}, buffer, {idParts}, {depth});';
var ASSIGN_STATEMENT = 'var {lhs} = {value};';
var SCOPE_RESOLVE_DEPTH = 'var {lhs} = scope.resolve({idParts},{depth});';
var SCOPE_RESOLVE_LOOSE_DEPTH = 'var {lhs} = scope.resolveLoose({idParts},{depth});';
var FUNC = 'function {functionName}({params}){\n  {body}\n}';
var SOURCE_URL = '\n  //# sourceURL = {name}.js\n';
var DECLARE_NATIVE_COMMANDS = 'var {name}Command = nativeCommands["{name}"];';
var DECLARE_UTILS = 'var {name}Util = utils["{name}"];';
var BUFFER_WRITE = 'buffer = buffer.write({value});';
var BUFFER_APPEND = 'buffer.data += {value};';
var BUFFER_WRITE_ESCAPED = 'buffer = buffer.writeEscaped({value});';
var RETURN_BUFFER = 'return buffer;';
// codeTemplates ---------------------------- end

var nativeCode = [];
var substitute = util.substitute;
var each = util.each;

each(nativeUtils, function (v, name) {
  nativeCode.push(substitute(DECLARE_UTILS, {
    name: name
  }));
});

each(nativeCommands, function (v, name) {
  nativeCode.push(substitute(DECLARE_NATIVE_COMMANDS, {
    name: name
  }));
});

nativeCode = nativeCode.join('\n');

var lastLine = 1;

function markLine(pos, source) {
  if (lastLine === pos.line) {
    return;
  }
  lastLine = pos.line;
  source.push('pos.line = ' + pos.line + ';');
}

function resetGlobal() {
  lastLine = 1;
}

function getFunctionDeclare(functionName) {
  return ['function ' + functionName + '(scope, buffer, undefined) {\n    var data = scope.data;\n    var affix = scope.affix;'];
}

function guid(self, str) {
  return str + self.uuid++;
}

function considerSuffix(n, withSuffix) {
  var name = n;
  if (withSuffix && !/\.xtpl$/.test(name)) {
    name += '.xtpl';
  }
  return name;
}

function opExpression(e) {
  var source = [];
  var type = e.opType;
  var exp1 = void 0;
  var exp2 = void 0;
  var exp3 = void 0;
  var code1Source = void 0;
  var code2Source = void 0;
  var code3Source = void 0;
  var code3 = void 0;
  var code1 = this[e.op1.type](e.op1);
  var code2 = this[e.op2.type](e.op2);
  var exp = guid(this, 'exp');
  exp1 = code1.exp;
  exp2 = code2.exp;
  code1Source = code1.source;
  code2Source = code2.source;
  if (e.op3) {
    code3 = this[e.op3.type](e.op3);
    exp3 = code3.exp;
    code3Source = code3.source;
  }
  pushToArray(source, code1Source);
  source.push('var ' + exp + ' = ' + exp1 + ';');
  if (type === '&&' || type === '||') {
    source.push('if(' + (type === '&&' ? '' : '!') + '(' + exp + ')){');
    pushToArray(source, code2Source);
    source.push(exp + ' = ' + exp2 + ';');
    source.push('}');
  } else if (type === '?:') {
    pushToArray(source, code2Source);
    pushToArray(source, code3Source);
    source.push(exp + ' = (' + exp1 + ') ? (' + exp2 + ') : (' + exp3 + ');');
  } else {
    pushToArray(source, code2Source);
    source.push(exp + ' = (' + exp1 + ') ' + type + ' (' + exp2 + ');');
  }
  return {
    exp: exp,
    source: source
  };
}

function genFunction(self, statements) {
  var functionName = guid(self, 'func');
  var source = getFunctionDeclare(functionName);
  var statement = void 0;
  for (var _i = 0, len = statements.length; _i < len; _i++) {
    statement = statements[_i];
    pushToArray(source, self[statement.type](statement).source);
  }
  source.push(RETURN_BUFFER);
  source.push('}');
  // avoid deep closure for performance
  pushToArray(self.functionDeclares, source);
  return functionName;
}

function genConditionFunction(self, condition) {
  var functionName = guid(self, 'func');
  var source = getFunctionDeclare(functionName);
  var gen = self[condition.type](condition);
  pushToArray(source, gen.source);
  source.push('return ' + gen.exp + ';');
  source.push('}');
  pushToArray(self.functionDeclares, source);
  return functionName;
}

function genTopFunction(self, statements) {
  var catchError = self.config.catchError;
  var source = [
  // 'function run(tpl) {',
  TOP_DECLARATION, nativeCode,
  // decrease speed by 10%
  // for performance
  catchError ? 'try {' : ''];
  var statement = void 0;
  var i = void 0;
  var len = void 0;
  for (i = 0, len = statements.length; i < len; i++) {
    statement = statements[i];
    pushToArray(source, self[statement.type](statement, {
      top: 1
    }).source);
  }
  source.splice.apply(source, [2, 0].concat(self.functionDeclares).concat(''));
  source.push(RETURN_BUFFER);
  // source.push('}');
  // source.push('function tryRun(tpl) {');
  // source.push('try {');
  // source.push('ret = run(this);');
  if (catchError) {
    source.push.apply(source, ['} catch(e) {', 'if(!e.xtpl){', 'buffer.error(e);', '}else{ throw e; }', '}']);
  }
  //    source.push('}');
  //    source.push('return tryRun(this);');
  return {
    params: ['undefined'],
    source: source.join('\n')
  };
}

function genOptionFromFunction(self, func, escape, fn, elseIfs, inverse) {
  var source = [];
  var params = func.params;
  var hash = func.hash;
  var funcParams = [];
  var isSetFunction = func.id.string === 'set';
  if (params) {
    each(params, function (param) {
      var nextIdNameCode = self[param.type](param);
      pushToArray(source, nextIdNameCode.source);
      funcParams.push(nextIdNameCode.exp);
    });
  }
  var funcHash = [];
  if (hash) {
    each(hash.value, function (h) {
      var v = h[1];
      var key = h[0];
      var vCode = self[v.type](v);
      pushToArray(source, vCode.source);
      if (isSetFunction) {
        // support  {{set(x.y.z=1)}}
        // https://github.com/xtemplate/xtemplate/issues/54
        var resolvedParts = convertIdPartsToRawAccessor(self, source, key.parts).resolvedParts;
        funcHash.push({ key: resolvedParts, depth: key.depth, value: vCode.exp });
      } else {
        if (key.parts.length !== 1 || typeof key.parts[0] !== 'string') {
          throw new Error('invalid hash parameter');
        }
        funcHash.push([wrapByDoubleQuote(key.string), vCode.exp]);
      }
    });
  }
  var exp = '';
  // literal init array, do not use arr.push for performance
  if (funcParams.length || funcHash.length || escape || fn || inverse || elseIfs) {
    if (escape) {
      exp += ', escape: 1';
    }
    if (funcParams.length) {
      exp += ', params: [ ' + funcParams.join(',') + ' ]';
    }
    if (funcHash.length) {
      (function () {
        var hashStr = [];
        if (isSetFunction) {
          util.each(funcHash, function (h) {
            hashStr.push('{ key: [' + h.key.join(',') + '], value: ' + h.value + ', depth: ' + h.depth + ' }');
          });
          exp += ',hash: [ ' + hashStr.join(',') + ' ]';
        } else {
          util.each(funcHash, function (h) {
            hashStr.push(h[0] + ':' + h[1]);
          });
          exp += ',hash: { ' + hashStr.join(',') + ' }';
        }
      })();
    }
    if (fn) {
      exp += ',fn: ' + fn;
    }
    if (inverse) {
      exp += ',inverse: ' + inverse;
    }
    if (elseIfs) {
      exp += ',elseIfs: ' + elseIfs;
    }
    exp = '{ ' + exp.slice(1) + ' }';
  }
  return {
    exp: exp || '{}',
    funcParams: funcParams,
    source: source
  };
}

function generateFunction(self, func, block, escape_) {
  var escape = escape_;
  var source = [];
  markLine(func.pos, source);
  var functionConfigCode = void 0;
  var idName = void 0;
  var id = func.id;
  var idString = id.string;
  if (idString in nativeCommands) {
    escape = 0;
  }
  var idParts = id.parts;
  var i = void 0;
  if (idString === 'elseif') {
    return {
      exp: '',
      source: []
    };
  }
  if (block) {
    var programNode = block.program;
    var inverse = programNode.inverse;
    var fnName = void 0;
    var elseIfsName = void 0;
    var inverseName = void 0;
    var elseIfs = [];
    var elseIf = void 0;
    var functionValue = void 0;
    var statement = void 0;
    var statements = programNode.statements;
    var thenStatements = [];
    for (i = 0; i < statements.length; i++) {
      statement = statements[i];
      /* eslint no-cond-assign:0 */
      if (statement.type === 'expressionStatement' && (functionValue = statement.value) && (functionValue = functionValue.parts) && functionValue.length === 1 && (functionValue = functionValue[0]) && functionValue.type === 'function' && functionValue.id.string === 'elseif') {
        if (elseIf) {
          elseIfs.push(elseIf);
        }
        elseIf = {
          condition: functionValue.params[0],
          statements: []
        };
      } else if (elseIf) {
        elseIf.statements.push(statement);
      } else {
        thenStatements.push(statement);
      }
    }
    if (elseIf) {
      elseIfs.push(elseIf);
    }
    // find elseIfs
    fnName = genFunction(self, thenStatements);
    if (inverse) {
      inverseName = genFunction(self, inverse);
    }
    if (elseIfs.length) {
      var elseIfsVariable = [];
      for (i = 0; i < elseIfs.length; i++) {
        var elseIfStatement = elseIfs[i];
        var conditionName = genConditionFunction(self, elseIfStatement.condition);
        elseIfsVariable.push('{\n        test: ' + conditionName + ',\n        fn: ' + genFunction(self, elseIfStatement.statements) + '\n        }');
      }
      elseIfsName = '[ ' + elseIfsVariable.join(',') + ' ]';
    }
    functionConfigCode = genOptionFromFunction(self, func, escape, fnName, elseIfsName, inverseName);
    pushToArray(source, functionConfigCode.source);
  }

  var _self$config = self.config;
  var isModule = _self$config.isModule;
  var withSuffix = _self$config.withSuffix;


  if (idString === 'include' || idString === 'parse' || idString === 'extend') {
    if (!func.params || func.params.length > 2) {
      throw new Error('include/parse/extend can only has at most two parameter!');
    }
  }

  if (isModule) {
    if (idString === 'include' || idString === 'parse') {
      var name = considerSuffix(func.params[0].value, withSuffix);
      func.params[0] = { type: 'raw', value: 'require' + '("' + name + '")' };
    }
  }

  if (!functionConfigCode) {
    functionConfigCode = genOptionFromFunction(self, func, escape, null, null, null);
    pushToArray(source, functionConfigCode.source);
  }

  if (!block) {
    idName = guid(self, 'callRet');
    source.push('var ' + idName);
  }

  if (idString in nativeCommands) {
    if (idString === 'extend') {
      source.push('runtime.extendTpl = ' + functionConfigCode.exp);
      source.push('buffer = buffer.async(\n      function(newBuffer){runtime.extendTplBuffer = newBuffer;}\n      );');
      if (isModule) {
        var _name = considerSuffix(func.params[0].value, withSuffix);
        source.push('runtime.extendTplFn = ' + 'require' + '("' + _name + '");');
      }
    } else if (idString === 'include') {
      source.push('buffer = root.' + (isModule ? 'includeModule' : 'include') + '(scope, ' + functionConfigCode.exp + ', buffer,tpl);');
    } else if (idString === 'includeOnce') {
      source.push('buffer = root.' + (isModule ? 'includeOnceModule' : 'includeOnce') + '(scope, ' + functionConfigCode.exp + ', buffer,tpl);');
    } else if (idString === 'parse') {
      source.push('buffer = root.' + (isModule ? 'includeModule' : 'include') + '(new scope.constructor(), ' + functionConfigCode.exp + ', buffer, tpl);');
    } else {
      source.push(substitute(CALL_NATIVE_COMMAND, {
        lhs: block ? 'buffer' : idName,
        name: idString,
        option: functionConfigCode.exp
      }));
    }
  } else if (block) {
    source.push(substitute(CALL_CUSTOM_COMMAND, {
      option: functionConfigCode.exp,
      idParts: convertIdPartsToRawAccessor(self, source, idParts).arr
    }));
  } else {
    var resolveParts = convertIdPartsToRawAccessor(self, source, idParts);
    // {{x.y().q.z()}}
    // do not need scope resolution, call data function directly
    if (resolveParts.funcRet) {
      source.push(substitute(CALL_DATA_FUNCTION, {
        lhs: idName,
        params: functionConfigCode.funcParams.join(','),
        idParts: resolveParts.arr,
        depth: id.depth
      }));
    } else {
      source.push(substitute(id.depth ? CALL_FUNCTION_DEPTH : CALL_FUNCTION, {
        lhs: idName,
        option: functionConfigCode.exp,
        idParts: resolveParts.arr,
        depth: id.depth
      }));
    }
  }

  return {
    exp: idName,
    source: source
  };
}

function AstToJSProcessor(config) {
  this.functionDeclares = [];
  this.config = config;
  this.uuid = 0;
}

AstToJSProcessor.prototype = {
  constructor: AstToJSProcessor,

  raw: function raw(_raw) {
    return {
      exp: _raw.value
    };
  },
  arrayExpression: function arrayExpression(e) {
    var list = e.list;
    var len = list.length;
    var r = void 0;
    var source = [];
    var exp = [];
    for (var _i2 = 0; _i2 < len; _i2++) {
      r = this[list[_i2].type](list[_i2]);
      pushToArray(source, r.source);
      exp.push(r.exp);
    }
    return {
      exp: '[ ' + exp.join(',') + ' ]',
      source: source
    };
  },
  objectExpression: function objectExpression(e) {
    var obj = e.obj;
    var len = obj.length;
    var r = void 0;
    var source = [];
    var exp = [];
    for (var _i3 = 0; _i3 < len; _i3++) {
      var item = obj[_i3];
      r = this[item[1].type](item[1]);
      pushToArray(source, r.source);
      exp.push(wrapByDoubleQuote(item[0]) + ': ' + r.exp);
    }
    return {
      exp: '{ ' + exp.join(',') + ' }',
      source: source
    };
  },


  conditionalExpression: opExpression,

  conditionalOrExpression: opExpression,

  conditionalAndExpression: opExpression,

  relationalExpression: opExpression,

  equalityExpression: opExpression,

  additiveExpression: opExpression,

  multiplicativeExpression: opExpression,

  unaryExpression: function unaryExpression(e) {
    var code = this[e.value.type](e.value);
    return {
      exp: e.unaryType + '(' + code.exp + ')',
      source: code.source
    };
  },
  string: function string(e) {
    // same as contentNode.value
    return {
      exp: wrapBySingleQuote(escapeString(e.value, 1)),
      source: []
    };
  },
  number: function number(e) {
    return {
      exp: e.value,
      source: []
    };
  },
  id: function id(idNode) {
    var source = [];
    var self = this;
    var loose = !self.config.strict;
    markLine(idNode.pos, source);
    if (compilerTools.isGlobalId(idNode)) {
      return {
        exp: idNode.string,
        source: source
      };
    }
    var depth = idNode.depth;
    var idParts = idNode.parts;
    var idName = guid(self, 'id');
    if (depth) {
      source.push(substitute(loose ? SCOPE_RESOLVE_LOOSE_DEPTH : SCOPE_RESOLVE_DEPTH, {
        lhs: idName,
        idParts: convertIdPartsToRawAccessor(self, source, idParts).arr,
        depth: depth
      }));
      return {
        exp: idName,
        source: source
      };
    }
    var part0 = idParts[0];
    var remain = void 0;
    var remainParts = void 0;
    if (part0 === 'this') {
      remainParts = idParts.slice(1);
      source.push(substitute(ASSIGN_STATEMENT, {
        lhs: idName,
        value: remainParts.length ? chainedVariableRead(self, source, remainParts, undefined, undefined, loose) : 'data'
      }));
      return {
        exp: idName,
        source: source
      };
    } else if (part0 === 'root') {
      remainParts = idParts.slice(1);
      remain = remainParts.join('.');
      if (remain) {
        remain = '.' + remain;
      }
      source.push(substitute(ASSIGN_STATEMENT, {
        lhs: idName,
        value: remain ? chainedVariableRead(self, source, remainParts, true, undefined, loose) : 'scope.root.data',
        idParts: remain
      }));
      return {
        exp: idName,
        source: source
      };
    }
    // {{x.y().z}}
    if (idParts[0].type === 'function') {
      var resolvedParts = convertIdPartsToRawAccessor(self, source, idParts).resolvedParts;
      for (var _i4 = 1; _i4 < resolvedParts.length; _i4++) {
        resolvedParts[_i4] = '[ ' + resolvedParts[_i4] + ' ]';
      }
      var value = void 0;
      if (loose) {
        value = compilerTools.genStackJudge(resolvedParts.slice(1), resolvedParts[0]);
      } else {
        value = resolvedParts[0];
        for (var ri = 1; ri < resolvedParts.length; ri++) {
          value += resolvedParts[ri];
        }
      }
      source.push(substitute(ASSIGN_STATEMENT, {
        lhs: idName,
        value: value
      }));
    } else {
      source.push(substitute(ASSIGN_STATEMENT, {
        lhs: idName,
        value: chainedVariableRead(self, source, idParts, false, true, loose)
      }));
    }
    return {
      exp: idName,
      source: source
    };
  },
  'function': function _function(func, escape) {
    return generateFunction(this, func, false, escape);
  },
  blockStatement: function blockStatement(block) {
    return generateFunction(this, block.func, block);
  },
  expressionStatement: function expressionStatement(_expressionStatement) {
    var source = [];
    var escape = _expressionStatement.escape;
    var code = void 0;
    var expression = _expressionStatement.value;
    var type = expression.type;
    var expressionOrVariable = void 0;
    code = this[type](expression, escape);
    pushToArray(source, code.source);
    expressionOrVariable = code.exp;
    source.push(substitute(escape ? BUFFER_WRITE_ESCAPED : BUFFER_WRITE, {
      value: expressionOrVariable
    }));
    return {
      exp: '',
      source: source
    };
  },
  contentStatement: function contentStatement(_contentStatement) {
    return {
      exp: '',
      source: [substitute(BUFFER_APPEND, {
        value: wrapBySingleQuote(escapeString(_contentStatement.value, 0))
      })]
    };
  }
};

var anonymousCount = 0;

/**
 * compiler for xtemplate
 * @class XTemplate.Compiler
 * @singleton
 */
var compiler = {
  /**
   * get ast of template
   * @param {String} [name] xtemplate name
   * @param {String} tplContent
   * @return {Object}
   */
  parse: function parse(tplContent, name) {
    if (tplContent) {
      var ret = void 0;
      try {
        ret = parser.parse(tplContent, name);
      } catch (err) {
        var e = void 0;
        if (err instanceof Error) {
          e = err;
        } else {
          e = new Error(err);
        }
        var errorStr = 'XTemplate error ';
        try {
          e.stack = errorStr + e.stack;
          e.message = errorStr + e.message;
        } catch (e2) {
          // empty
        }
        throw e;
      }
      return ret;
    }
    return {
      statements: []
    };
  },
  compileToStr: function compileToStr(param) {
    var func = compiler.compileToJson(param);
    return substitute(FUNC, {
      functionName: param.functionName || '',
      params: func.params.join(','),
      body: func.source
    });
  },

  /**
   * get template function json format
   * @param {String} [param.name] xtemplate name
   * @param {String} param.content
   * @param {Boolean} [param.isModule] whether generated function is used in module
   * @param {Boolean} [param.withSuffix] whether generated require name with suffix xtpl
   * @param {Boolean} [param.catchError] whether to try catch generated function to
   * provide good error message
   * @param {Boolean} [param.strict] whether to generate strict function
   * @return {Object}
   */
  compileToJson: function compileToJson(param) {
    resetGlobal();
    var name = param.name = param.name || 'xtemplate' + ++anonymousCount;
    var content = param.content;
    var root = compiler.parse(content, name);
    return genTopFunction(new AstToJSProcessor(param), root.statements);
  },

  /**
   * get template function
   * @param {String} tplContent
   * @param {String} name template file name
   * @param {Object} config
   * @return {Function}
   */
  compile: function compile(tplContent, name, config) {
    var code = compiler.compileToJson(util.merge(config, {
      content: tplContent,
      name: name
    }));
    var source = code.source;
    source += substitute(SOURCE_URL, {
      name: name
    });
    var args = code.params.concat(source);
    // eval is not ok for eval("(function(){})") ie
    return Function.apply(null, args);
  }
};

module.exports = compiler;

/*
 todo:
 need oop, new Source().this()
 */
},{"./compiler/ast":3,"./compiler/parser":4,"./compiler/tools":5,"./runtime":7}],3:[function(require,module,exports){
'use strict';

/**
 * Ast node class for xtemplate
 */
var ast = {};

function sameArray(a1, a2) {
  var l1 = a1.length;
  var l2 = a2.length;
  if (l1 !== l2) {
    return 0;
  }
  for (var i = 0; i < l1; i++) {
    if (a1[i] !== a2[i]) {
      return 0;
    }
  }
  return 1;
}

ast.ProgramNode = function ProgramNode(pos, statements, inverse) {
  var self = this;
  self.pos = pos;
  self.statements = statements;
  self.inverse = inverse;
};

ast.ProgramNode.prototype.type = 'program';

ast.BlockStatement = function BlockStatement(pos, func, program, close, escape) {
  var closeParts = close.parts;
  var self = this;
  var e = void 0;
  // no close tag
  if (!sameArray(func.id.parts, closeParts)) {
    e = 'in file: ' + pos.filename + ' syntax error at line     ' + pos.line + ', col ' + pos.col + ':\n    expect {{/' + func.id.parts + '}} not {{/' + closeParts + '}}';
    throw new Error(e);
  }
  self.escape = escape;
  self.pos = pos;
  self.func = func;
  self.program = program;
};

ast.BlockStatement.prototype.type = 'blockStatement';

ast.ExpressionStatement = function ExpressionStatement(pos, expression, escape) {
  var self = this;
  self.pos = pos;
  self.value = expression;
  self.escape = escape;
};

ast.ExpressionStatement.prototype.type = 'expressionStatement';

ast.ContentStatement = function ContentStatement(pos, value) {
  var self = this;
  self.pos = pos;
  self.value = value || '';
};

ast.ContentStatement.prototype.type = 'contentStatement';

ast.UnaryExpression = function UnaryExpression(unaryType, v) {
  this.value = v;
  this.unaryType = unaryType;
};

ast.Function = function Function(pos, id, params, hash) {
  var self = this;
  self.pos = pos;
  self.id = id;
  self.params = params;
  self.hash = hash;
};

ast.Function.prototype.type = 'function';

ast.UnaryExpression.prototype.type = 'unaryExpression';

ast.MultiplicativeExpression = function MultiplicativeExpression(op1, opType, op2) {
  var self = this;
  self.op1 = op1;
  self.opType = opType;
  self.op2 = op2;
};

ast.MultiplicativeExpression.prototype.type = 'multiplicativeExpression';

ast.AdditiveExpression = function AdditiveExpression(op1, opType, op2) {
  var self = this;
  self.op1 = op1;
  self.opType = opType;
  self.op2 = op2;
};

ast.AdditiveExpression.prototype.type = 'additiveExpression';

ast.RelationalExpression = function RelationalExpression(op1, opType, op2) {
  var self = this;
  self.op1 = op1;
  self.opType = opType;
  self.op2 = op2;
};

ast.RelationalExpression.prototype.type = 'relationalExpression';

ast.EqualityExpression = function EqualityExpression(op1, opType, op2) {
  var self = this;
  self.op1 = op1;
  self.opType = opType;
  self.op2 = op2;
};

ast.EqualityExpression.prototype.type = 'equalityExpression';

ast.ConditionalAndExpression = function ConditionalAndExpression(op1, op2) {
  var self = this;
  self.op1 = op1;
  self.op2 = op2;
  self.opType = '&&';
};

ast.ConditionalAndExpression.prototype.type = 'conditionalAndExpression';

ast.ConditionalOrExpression = function ConditionalOrExpression(op1, op2) {
  var self = this;
  self.op1 = op1;
  self.op2 = op2;
  self.opType = '||';
};

ast.ConditionalOrExpression.prototype.type = 'conditionalOrExpression';

ast.ConditionalExpression = function ConditionalExpression(op1, op2, op3) {
  var self = this;
  self.op1 = op1;
  self.op2 = op2;
  self.op3 = op3;
  self.opType = '?:';
};
ast.ConditionalExpression.prototype.type = 'conditionalExpression';

ast.String = function StringType(pos, value) {
  var self = this;
  self.pos = pos;
  self.value = value;
};

ast.String.prototype.type = 'string';

ast.Number = function NumberType(pos, value) {
  var self = this;
  self.pos = pos;
  self.value = value;
};

ast.Number.prototype.type = 'number';

ast.Hash = function Hash(pos, value) {
  var self = this;
  self.pos = pos;
  self.value = value;
};

ast.Hash.prototype.type = 'hash';

ast.ArrayExpression = function ArrayExpression(list) {
  this.list = list;
};

ast.ArrayExpression.prototype.type = 'arrayExpression';

ast.ObjectExpression = function ObjectExpression(obj) {
  this.obj = obj;
};

ast.ObjectExpression.prototype.type = 'objectExpression';

ast.Id = function Id(pos, raw) {
  var self = this;
  var parts = [];
  var depth = 0;
  self.pos = pos;
  for (var i = 0, l = raw.length; i < l; i++) {
    var p = raw[i];
    if (p === '..') {
      depth++;
    } else {
      parts.push(p);
    }
  }
  self.parts = parts;
  self.string = parts.join('.');
  self.depth = depth;
};

ast.Id.prototype.type = 'id';

module.exports = ast;
},{}],4:[function(require,module,exports){
'use strict';/*
  Generated by kison.
*/var parser=function(undefined){/*jshint quotmark:false, loopfunc:true, indent:false, unused:false, asi:true, boss:true*//* Generated by kison */var parser={};var GrammarConst={'SHIFT_TYPE':1,'REDUCE_TYPE':2,'ACCEPT_TYPE':0,'TYPE_INDEX':0,'PRODUCTION_INDEX':1,'TO_INDEX':2};function peekStack(stack,n){n=n||1;return stack[stack.length-n];}/*jslint quotmark: false*//*jslint quotmark: false*/function mix(to,from){for(var f in from){to[f]=from[f];}}function isArray(obj){return'[object Array]'===Object.prototype.toString.call(obj);}function each(object,fn,context){if(object){var key,val,length,i=0;context=context||null;if(!isArray(object)){for(key in object){// can not use hasOwnProperty
if(fn.call(context,object[key],key,object)===false){break;}}}else{length=object.length;for(val=object[0];i<length;val=object[++i]){if(fn.call(context,val,i,object)===false){break;}}}}}function inArray(item,arr){for(var i=0,l=arr.length;i<l;i++){if(arr[i]===item){return true;}}return false;}var Lexer=function Lexer(cfg){var self=this;/*
     lex rules.
     @type {Object[]}
     @example
     [
     {
     regexp:'\\w+',
     state:['xx'],
     token:'c',
     // this => lex
     action:function(){}
     }
     ]
     *//*
     lex rules.
     @type {Object[]}
     @example
     [
     {
     regexp:'\\w+',
     state:['xx'],
     token:'c',
     // this => lex
     action:function(){}
     }
     ]
     */self.rules=[];mix(self,cfg);/*
     Input languages
     @type {String}
     *//*
     Input languages
     @type {String}
     */self.resetInput(self.input);};Lexer.prototype={'resetInput':function resetInput(input){mix(this,{input:input,matched:'',stateStack:[Lexer.STATIC.INITIAL],match:'',text:'',firstLine:1,lineNumber:1,lastLine:1,firstColumn:1,lastColumn:1});},'getCurrentRules':function getCurrentRules(){var self=this,currentState=self.stateStack[self.stateStack.length-1],rules=[];//#JSCOVERAGE_IF
//#JSCOVERAGE_IF
if(self.mapState){currentState=self.mapState(currentState);}each(self.rules,function(r){var state=r.state||r[3];if(!state){if(currentState===Lexer.STATIC.INITIAL){rules.push(r);}}else if(inArray(currentState,state)){rules.push(r);}});return rules;},'pushState':function pushState(state){this.stateStack.push(state);},'popState':function popState(num){num=num||1;var ret;while(num--){ret=this.stateStack.pop();}return ret;},'showDebugInfo':function showDebugInfo(){var self=this,DEBUG_CONTEXT_LIMIT=Lexer.STATIC.DEBUG_CONTEXT_LIMIT,matched=self.matched,match=self.match,input=self.input;matched=matched.slice(0,matched.length-match.length);//#JSCOVERAGE_IF 0
//#JSCOVERAGE_IF 0
var past=(matched.length>DEBUG_CONTEXT_LIMIT?'...':'')+matched.slice(0-DEBUG_CONTEXT_LIMIT).replace(/\n/g,' '),next=match+input;//#JSCOVERAGE_ENDIF
//#JSCOVERAGE_ENDIF
next=next.slice(0,DEBUG_CONTEXT_LIMIT).replace(/\n/g,' ')+(next.length>DEBUG_CONTEXT_LIMIT?'...':'');return past+next+'\n'+new Array(past.length+1).join('-')+'^';},'mapSymbol':function mapSymbolForCodeGen(t){return this.symbolMap[t];},'mapReverseSymbol':function mapReverseSymbol(rs){var self=this,symbolMap=self.symbolMap,i,reverseSymbolMap=self.reverseSymbolMap;if(!reverseSymbolMap&&symbolMap){reverseSymbolMap=self.reverseSymbolMap={};for(i in symbolMap){reverseSymbolMap[symbolMap[i]]=i;}}//#JSCOVERAGE_IF
//#JSCOVERAGE_IF
if(reverseSymbolMap){return reverseSymbolMap[rs];}else{return rs;}},'lex':function lex(){var self=this,input=self.input,i,rule,m,ret,lines,rules=self.getCurrentRules();self.match=self.text='';if(!input){return self.mapSymbol(Lexer.STATIC.END_TAG);}for(i=0;i<rules.length;i++){rule=rules[i];//#JSCOVERAGE_IF 0
//#JSCOVERAGE_IF 0
var regexp=rule.regexp||rule[1],token=rule.token||rule[0],action=rule.action||rule[2]||undefined;//#JSCOVERAGE_ENDIF
//#JSCOVERAGE_ENDIF
if(m=input.match(regexp)){lines=m[0].match(/\n.*/g);if(lines){self.lineNumber+=lines.length;}mix(self,{firstLine:self.lastLine,lastLine:self.lineNumber,firstColumn:self.lastColumn,lastColumn:lines?lines[lines.length-1].length-1:self.lastColumn+m[0].length});var match;// for error report
// for error report
match=self.match=m[0];// all matches
// all matches
self.matches=m;// may change by user
// may change by user
self.text=match;// matched content utils now
// matched content utils now
self.matched+=match;ret=action&&action.call(self);if(ret===undefined){ret=token;}else{ret=self.mapSymbol(ret);}input=input.slice(match.length);self.input=input;if(ret){return ret;}else{// ignore
return self.lex();}}}}};Lexer.STATIC={'INITIAL':'I','DEBUG_CONTEXT_LIMIT':20,'END_TAG':'$EOF'};var lexer=new Lexer({'rules':[[0,/^[\s\S]*?(?={{)/,function(){var self=this,text=self.text,m,n=0;if(m=text.match(/\\+$/)){n=m[0].length;}if(n%2){self.pushState('et');text=text.slice(0,-1);}else{self.pushState('t');}if(n){text=text.replace(/\\+$/g,function(m){return new Array(m.length/2+1).join('\\');});}// https://github.com/kissyteam/kissy/issues/330
// return even empty
// https://github.com/kissyteam/kissy/issues/330
// return even empty
self.text=text;return'CONTENT';}],['b',/^[\s\S]+/,0],['b',/^[\s\S]{2,}?(?:(?={{)|$)/,function popState(){this.popState();},['et']],['c',/^{{\{?~?(?:#|@)/,function(){var self=this,text=self.text;if(text.slice(0,3)==='{{{'){self.pushState('p');}else{self.pushState('e');}},['t']],['d',/^{{\{?~?\//,function(){var self=this,text=self.text;if(text.slice(0,3)==='{{{'){self.pushState('p');}else{self.pushState('e');}},['t']],['e',/^{{\s*else\s*}}/,function popState(){this.popState();},['t']],[0,/^{{![\s\S]*?}}/,function popState(){this.popState();},['t']],['b',/^{{%([\s\S]*?)%}}/,function(){// return to content mode
this.text=this.matches[1]||'';this.popState();},['t']],['f',/^{{\{?~?/,function(){var self=this,text=self.text;if(text.slice(0,3)==='{{{'){self.pushState('p');}else{self.pushState('e');}},['t']],[0,/^\s+/,0,['p','e']],['g',/^,/,0,['p','e']],['h',/^~?}}}/,function(){this.popState(2);},['p']],['h',/^~?}}/,function(){this.popState(2);},['e']],['i',/^\(/,0,['p','e']],['j',/^\)/,0,['p','e']],['k',/^\|\|/,0,['p','e']],['l',/^&&/,0,['p','e']],['m',/^===/,0,['p','e']],['n',/^!==/,0,['p','e']],['o',/^>=/,0,['p','e']],['p',/^<=/,0,['p','e']],['q',/^>/,0,['p','e']],['r',/^</,0,['p','e']],['s',/^\+/,0,['p','e']],['t',/^-/,0,['p','e']],['u',/^\*/,0,['p','e']],['v',/^\//,0,['p','e']],['w',/^%/,0,['p','e']],['x',/^!/,0,['p','e']],['y',/^"(\\[\s\S]|[^\\"\n])*"/,function(){this.text=this.text.slice(1,-1).replace(/\\"/g,'"');},['p','e']],['y',/^'(\\[\s\S]|[^\\'\n])*'/,function(){this.text=this.text.slice(1,-1).replace(/\\'/g,'\'');},['p','e']],['z',/^\d+(?:\.\d+)?(?:e-?\d+)?/i,0,['p','e']],['aa',/^=/,0,['p','e']],['ab',/^\.\./,function(){// wait for '/'
this.pushState('ws');},['p','e']],['ac',/^\//,function popState(){this.popState();},['ws']],['ac',/^\./,0,['p','e']],['ad',/^\[/,0,['p','e']],['ae',/^\]/,0,['p','e']],['af',/^\{/,0,['p','e']],['ag',/^\:/,0,['p','e']],['ah',/^\?/,0,['p','e']],['ai',/^\}/,0,['p','e']],['ab',/^[a-zA-Z_$][a-zA-Z0-9_$]*/,0,['p','e']]]});parser.lexer=lexer;lexer.symbolMap={'$EOF':'a','CONTENT':'b','OPEN_BLOCK':'c','OPEN_CLOSE_BLOCK':'d','INVERSE':'e','OPEN_TPL':'f','COMMA':'g','CLOSE':'h','L_PAREN':'i','R_PAREN':'j','OR':'k','AND':'l','LOGIC_EQUALS':'m','LOGIC_NOT_EQUALS':'n','GE':'o','LE':'p','GT':'q','LT':'r','PLUS':'s','MINUS':'t','MULTIPLY':'u','DIVIDE':'v','MODULUS':'w','NOT':'x','STRING':'y','NUMBER':'z','EQUALS':'aa','ID':'ab','SEP':'ac','L_BRACKET':'ad','R_BRACKET':'ae','L_BRACE':'af','COLON':'ag','QUERY':'ah','R_BRACE':'ai','$START':'aj','program':'ak','statements':'al','statement':'am','function':'an','id':'ao','expression':'ap','params':'aq','hash':'ar','param':'as','conditionalExpression':'at','listExpression':'au','objectExpression':'av','objectPart':'aw','conditionalOrExpression':'ax','conditionalAndExpression':'ay','equalityExpression':'az','relationalExpression':'ba','additiveExpression':'bb','multiplicativeExpression':'bc','unaryExpression':'bd','primaryExpression':'be','hashSegment':'bf','idSegments':'bg'};parser.productions=[['aj',['ak']],['ak',['al','e','al'],function(){return new this.yy.ProgramNode({filename:this.lexer.filename,line:this.lexer.firstLine,col:this.lexer.firstColumn},this.$1,this.$3);}],['ak',['al'],function(){return new this.yy.ProgramNode({filename:this.lexer.filename,line:this.lexer.firstLine,col:this.lexer.firstColumn},this.$1);}],['al',['am'],function(){return[this.$1];}],['al',['al','am'],function(){var statements=this.$1;var statement=this.$2;if(statements.length){var lastStatement=statements[statements.length-1];if(lastStatement.rtrim&&statement&&statement.type==='contentStatement'&&!statement.value.trim()){}else if(statement.ltrim&&lastStatement&&lastStatement.type==='contentStatement'&&!lastStatement.value.trim()){statements[statements.length-1]=statement;}else{statements.push(statement);}}else{statements.push(statement);}}],['am',['c','an','h','ak','d','ao','h'],function(){var program=this.$4;var openBlock=this.$1;var lastClose=this.$7;var statements=program.statements;var close=this.$3;var openCloseBlock=this.$5;if(close.indexOf('~}')!==-1&&statements[0]&&statements[0].type==='contentStatement'){if(!statements[0].value.trim()){statements.shift();}}if(openCloseBlock.indexOf('{~')!==-1&&statements[statements.length-1]&&statements[statements.length-1].type==='contentStatement'){if(!statements[statements.length-1].value.trim()){statements.pop();}}var statement=new this.yy.BlockStatement({filename:this.lexer.filename,line:this.lexer.firstLine,col:this.lexer.firstColumn},this.$2,program,this.$6,this.$1.slice(0,3)!=='{{{');if(openBlock.indexOf('{~')!==-1){statement.ltrim=1;}if(lastClose.indexOf('~}')!==-1){statement.rtrim=1;}return statement;}],['am',['f','ap','h'],function(){var openTpl=this.$1;var close=this.$3;var statement=new this.yy.ExpressionStatement({filename:this.lexer.filename,line:this.lexer.firstLine,col:this.lexer.firstColumn},this.$2,this.$1.slice(0,3)!=='{{{');if(openTpl.indexOf('{~')!==-1){statement.ltrim=1;}if(close.indexOf('~}')!==-1){statement.rtrim=1;}return statement;}],['am',['b'],function(){return new this.yy.ContentStatement({filename:this.lexer.filename,line:this.lexer.firstLine,col:this.lexer.firstColumn},this.$1);}],['an',['ao','i','aq','g','ar','j'],function(){return new this.yy.Function({filename:this.lexer.filename,line:this.lexer.firstLine,col:this.lexer.firstColumn},this.$1,this.$3,this.$5);}],['an',['ao','i','aq','j'],function(){return new this.yy.Function({filename:this.lexer.filename,line:this.lexer.firstLine,col:this.lexer.firstColumn},this.$1,this.$3);}],['an',['ao','i','ar','j'],function(){return new this.yy.Function({filename:this.lexer.filename,line:this.lexer.firstLine,col:this.lexer.firstColumn},this.$1,null,this.$3);}],['an',['ao','i','j'],function(){return new this.yy.Function({filename:this.lexer.filename,line:this.lexer.firstLine,col:this.lexer.firstColumn},this.$1);}],['aq',['aq','g','as'],function(){this.$1.push(this.$3);}],['aq',['as'],function(){return[this.$1];}],['as',['ap']],['ap',['at']],['ap',['ad','au','ae'],function(){return new this.yy.ArrayExpression(this.$2);}],['ap',['ad','ae'],function(){return new this.yy.ArrayExpression([]);}],['ap',['af','av','ai'],function(){return new this.yy.ObjectExpression(this.$2);}],['ap',['af','ai'],function(){return new this.yy.ObjectExpression([]);}],['aw',['y','ag','ap'],function(){return[this.$1,this.$3];}],['aw',['ab','ag','ap'],function(){return[this.$1,this.$3];}],['av',['aw'],function(){return[this.$1];}],['av',['av','g','aw'],function(){this.$1.push(this.$3);}],['au',['ap'],function(){return[this.$1];}],['au',['au','g','ap'],function(){this.$1.push(this.$3);}],['at',['ax']],['at',['ax','ah','ax','ag','at'],function(){return new this.yy.ConditionalExpression(this.$1,this.$3,this.$5);}],['ax',['ay']],['ax',['ax','k','ay'],function(){return new this.yy.ConditionalOrExpression(this.$1,this.$3);}],['ay',['az']],['ay',['ay','l','az'],function(){return new this.yy.ConditionalAndExpression(this.$1,this.$3);}],['az',['ba']],['az',['az','m','ba'],function(){return new this.yy.EqualityExpression(this.$1,'===',this.$3);}],['az',['az','n','ba'],function(){return new this.yy.EqualityExpression(this.$1,'!==',this.$3);}],['ba',['bb']],['ba',['ba','r','bb'],function(){return new this.yy.RelationalExpression(this.$1,'<',this.$3);}],['ba',['ba','q','bb'],function(){return new this.yy.RelationalExpression(this.$1,'>',this.$3);}],['ba',['ba','p','bb'],function(){return new this.yy.RelationalExpression(this.$1,'<=',this.$3);}],['ba',['ba','o','bb'],function(){return new this.yy.RelationalExpression(this.$1,'>=',this.$3);}],['bb',['bc']],['bb',['bb','s','bc'],function(){return new this.yy.AdditiveExpression(this.$1,'+',this.$3);}],['bb',['bb','t','bc'],function(){return new this.yy.AdditiveExpression(this.$1,'-',this.$3);}],['bc',['bd']],['bc',['bc','u','bd'],function(){return new this.yy.MultiplicativeExpression(this.$1,'*',this.$3);}],['bc',['bc','v','bd'],function(){return new this.yy.MultiplicativeExpression(this.$1,'/',this.$3);}],['bc',['bc','w','bd'],function(){return new this.yy.MultiplicativeExpression(this.$1,'%',this.$3);}],['bd',['x','bd'],function(){return new this.yy.UnaryExpression(this.$1,this.$2);}],['bd',['t','bd'],function(){return new this.yy.UnaryExpression(this.$1,this.$2);}],['bd',['be']],['be',['y'],function(){return new this.yy.String({line:this.lexer.firstLine,col:this.lexer.firstColumn},this.$1);}],['be',['z'],function(){return new this.yy.Number({line:this.lexer.firstLine,col:this.lexer.firstColumn},this.$1);}],['be',['ao']],['be',['i','ap','j'],function(){return this.$2;}],['ar',['ar','g','bf'],function(){this.$1.value.push(this.$3);}],['ar',['bf'],function(){return new this.yy.Hash({line:this.lexer.firstLine,col:this.lexer.firstColumn},[this.$1]);}],['bf',['ao','aa','ap'],function(){return[this.$1,this.$3];}],['ao',['bg'],function(){return new this.yy.Id({line:this.lexer.firstLine,col:this.lexer.firstColumn},this.$1);}],['bg',['an'],function(){return[this.$1];}],['bg',['bg','ac','ab'],function(){this.$1.push(this.$3);}],['bg',['bg','ad','ap','ae'],function(){this.$1.push(this.$3);}],['bg',['ab'],function(){return[this.$1];}]];parser.table={'gotos':{'0':{'ak':4,'al':5,'am':6},'2':{'an':8,'ao':9,'bg':10},'3':{'an':18,'ao':19,'ap':20,'at':21,'ax':22,'ay':23,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'5':{'am':31},'11':{'an':18,'ao':19,'ap':36,'at':21,'ax':22,'ay':23,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'12':{'an':18,'ao':19,'bd':37,'be':29,'bg':10},'13':{'an':18,'ao':19,'bd':38,'be':29,'bg':10},'16':{'an':18,'ao':19,'ap':40,'at':21,'au':41,'ax':22,'ay':23,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'17':{'av':45,'aw':46},'30':{'al':62,'am':6},'32':{'ak':63,'al':5,'am':6},'33':{'an':18,'ao':65,'ap':66,'aq':67,'ar':68,'as':69,'at':21,'ax':22,'ay':23,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bf':70,'bg':10},'35':{'an':18,'ao':19,'ap':72,'at':21,'ax':22,'ay':23,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'48':{'an':18,'ao':19,'ay':80,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'49':{'an':18,'ao':19,'ax':81,'ay':23,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'50':{'an':18,'ao':19,'az':82,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'51':{'an':18,'ao':19,'ba':83,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'52':{'an':18,'ao':19,'ba':84,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'53':{'an':18,'ao':19,'bb':85,'bc':27,'bd':28,'be':29,'bg':10},'54':{'an':18,'ao':19,'bb':86,'bc':27,'bd':28,'be':29,'bg':10},'55':{'an':18,'ao':19,'bb':87,'bc':27,'bd':28,'be':29,'bg':10},'56':{'an':18,'ao':19,'bb':88,'bc':27,'bd':28,'be':29,'bg':10},'57':{'an':18,'ao':19,'bc':89,'bd':28,'be':29,'bg':10},'58':{'an':18,'ao':19,'bc':90,'bd':28,'be':29,'bg':10},'59':{'an':18,'ao':19,'bd':91,'be':29,'bg':10},'60':{'an':18,'ao':19,'bd':92,'be':29,'bg':10},'61':{'an':18,'ao':19,'bd':93,'be':29,'bg':10},'62':{'am':31},'74':{'an':18,'ao':19,'ap':101,'at':21,'ax':22,'ay':23,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'76':{'an':18,'ao':19,'ap':102,'at':21,'ax':22,'ay':23,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'77':{'an':18,'ao':19,'ap':103,'at':21,'ax':22,'ay':23,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'78':{'aw':104},'94':{'an':18,'ao':106,'bg':10},'95':{'an':18,'ao':19,'ap':107,'at':21,'ax':22,'ay':23,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bg':10},'96':{'an':18,'ao':65,'ap':66,'ar':108,'as':109,'at':21,'ax':22,'ay':23,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bf':70,'bg':10},'98':{'an':18,'ao':110,'bf':111,'bg':10},'105':{'an':18,'ao':19,'at':112,'ax':22,'ay':23,'az':24,'ba':25,'bb':26,'bc':27,'bd':28,'be':29,'bg':10}},'action':{'0':{'b':[1,undefined,1],'c':[1,undefined,2],'f':[1,undefined,3]},'1':{'a':[2,7],'e':[2,7],'c':[2,7],'f':[2,7],'b':[2,7],'d':[2,7]},'2':{'ab':[1,undefined,7]},'3':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7],'ad':[1,undefined,16],'af':[1,undefined,17]},'4':{'a':[0]},'5':{'a':[2,2],'d':[2,2],'b':[1,undefined,1],'c':[1,undefined,2],'e':[1,undefined,30],'f':[1,undefined,3]},'6':{'a':[2,3],'e':[2,3],'c':[2,3],'f':[2,3],'b':[2,3],'d':[2,3]},'7':{'i':[2,61],'ac':[2,61],'ad':[2,61],'h':[2,61],'ah':[2,61],'k':[2,61],'l':[2,61],'m':[2,61],'n':[2,61],'o':[2,61],'p':[2,61],'q':[2,61],'r':[2,61],'s':[2,61],'t':[2,61],'u':[2,61],'v':[2,61],'w':[2,61],'j':[2,61],'ae':[2,61],'g':[2,61],'aa':[2,61],'ag':[2,61],'ai':[2,61]},'8':{'i':[2,58],'ac':[2,58],'ad':[2,58],'h':[1,undefined,32]},'9':{'i':[1,undefined,33]},'10':{'i':[2,57],'h':[2,57],'ah':[2,57],'k':[2,57],'l':[2,57],'m':[2,57],'n':[2,57],'o':[2,57],'p':[2,57],'q':[2,57],'r':[2,57],'s':[2,57],'t':[2,57],'u':[2,57],'v':[2,57],'w':[2,57],'j':[2,57],'ae':[2,57],'g':[2,57],'aa':[2,57],'ag':[2,57],'ai':[2,57],'ac':[1,undefined,34],'ad':[1,undefined,35]},'11':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7],'ad':[1,undefined,16],'af':[1,undefined,17]},'12':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'13':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'14':{'h':[2,50],'ah':[2,50],'k':[2,50],'l':[2,50],'m':[2,50],'n':[2,50],'o':[2,50],'p':[2,50],'q':[2,50],'r':[2,50],'s':[2,50],'t':[2,50],'u':[2,50],'v':[2,50],'w':[2,50],'j':[2,50],'ae':[2,50],'g':[2,50],'ag':[2,50],'ai':[2,50]},'15':{'h':[2,51],'ah':[2,51],'k':[2,51],'l':[2,51],'m':[2,51],'n':[2,51],'o':[2,51],'p':[2,51],'q':[2,51],'r':[2,51],'s':[2,51],'t':[2,51],'u':[2,51],'v':[2,51],'w':[2,51],'j':[2,51],'ae':[2,51],'g':[2,51],'ag':[2,51],'ai':[2,51]},'16':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7],'ad':[1,undefined,16],'ae':[1,undefined,39],'af':[1,undefined,17]},'17':{'y':[1,undefined,42],'ab':[1,undefined,43],'ai':[1,undefined,44]},'18':{'h':[2,58],'ah':[2,58],'i':[2,58],'k':[2,58],'l':[2,58],'m':[2,58],'n':[2,58],'o':[2,58],'p':[2,58],'q':[2,58],'r':[2,58],'s':[2,58],'t':[2,58],'u':[2,58],'v':[2,58],'w':[2,58],'ac':[2,58],'ad':[2,58],'j':[2,58],'ae':[2,58],'g':[2,58],'aa':[2,58],'ag':[2,58],'ai':[2,58]},'19':{'h':[2,52],'ah':[2,52],'k':[2,52],'l':[2,52],'m':[2,52],'n':[2,52],'o':[2,52],'p':[2,52],'q':[2,52],'r':[2,52],'s':[2,52],'t':[2,52],'u':[2,52],'v':[2,52],'w':[2,52],'j':[2,52],'ae':[2,52],'g':[2,52],'ag':[2,52],'ai':[2,52],'i':[1,undefined,33]},'20':{'h':[1,undefined,47]},'21':{'h':[2,15],'j':[2,15],'ae':[2,15],'g':[2,15],'ai':[2,15]},'22':{'h':[2,26],'j':[2,26],'ae':[2,26],'g':[2,26],'ai':[2,26],'k':[1,undefined,48],'ah':[1,undefined,49]},'23':{'h':[2,28],'ah':[2,28],'k':[2,28],'j':[2,28],'ae':[2,28],'g':[2,28],'ag':[2,28],'ai':[2,28],'l':[1,undefined,50]},'24':{'h':[2,30],'ah':[2,30],'k':[2,30],'l':[2,30],'j':[2,30],'ae':[2,30],'g':[2,30],'ag':[2,30],'ai':[2,30],'m':[1,undefined,51],'n':[1,undefined,52]},'25':{'h':[2,32],'ah':[2,32],'k':[2,32],'l':[2,32],'m':[2,32],'n':[2,32],'j':[2,32],'ae':[2,32],'g':[2,32],'ag':[2,32],'ai':[2,32],'o':[1,undefined,53],'p':[1,undefined,54],'q':[1,undefined,55],'r':[1,undefined,56]},'26':{'h':[2,35],'ah':[2,35],'k':[2,35],'l':[2,35],'m':[2,35],'n':[2,35],'o':[2,35],'p':[2,35],'q':[2,35],'r':[2,35],'j':[2,35],'ae':[2,35],'g':[2,35],'ag':[2,35],'ai':[2,35],'s':[1,undefined,57],'t':[1,undefined,58]},'27':{'h':[2,40],'ah':[2,40],'k':[2,40],'l':[2,40],'m':[2,40],'n':[2,40],'o':[2,40],'p':[2,40],'q':[2,40],'r':[2,40],'s':[2,40],'t':[2,40],'j':[2,40],'ae':[2,40],'g':[2,40],'ag':[2,40],'ai':[2,40],'u':[1,undefined,59],'v':[1,undefined,60],'w':[1,undefined,61]},'28':{'h':[2,43],'ah':[2,43],'k':[2,43],'l':[2,43],'m':[2,43],'n':[2,43],'o':[2,43],'p':[2,43],'q':[2,43],'r':[2,43],'s':[2,43],'t':[2,43],'u':[2,43],'v':[2,43],'w':[2,43],'j':[2,43],'ae':[2,43],'g':[2,43],'ag':[2,43],'ai':[2,43]},'29':{'h':[2,49],'ah':[2,49],'k':[2,49],'l':[2,49],'m':[2,49],'n':[2,49],'o':[2,49],'p':[2,49],'q':[2,49],'r':[2,49],'s':[2,49],'t':[2,49],'u':[2,49],'v':[2,49],'w':[2,49],'j':[2,49],'ae':[2,49],'g':[2,49],'ag':[2,49],'ai':[2,49]},'30':{'b':[1,undefined,1],'c':[1,undefined,2],'f':[1,undefined,3]},'31':{'a':[2,4],'e':[2,4],'c':[2,4],'f':[2,4],'b':[2,4],'d':[2,4]},'32':{'b':[1,undefined,1],'c':[1,undefined,2],'f':[1,undefined,3]},'33':{'i':[1,undefined,11],'j':[1,undefined,64],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7],'ad':[1,undefined,16],'af':[1,undefined,17]},'34':{'ab':[1,undefined,71]},'35':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7],'ad':[1,undefined,16],'af':[1,undefined,17]},'36':{'j':[1,undefined,73]},'37':{'h':[2,48],'ah':[2,48],'k':[2,48],'l':[2,48],'m':[2,48],'n':[2,48],'o':[2,48],'p':[2,48],'q':[2,48],'r':[2,48],'s':[2,48],'t':[2,48],'u':[2,48],'v':[2,48],'w':[2,48],'j':[2,48],'ae':[2,48],'g':[2,48],'ag':[2,48],'ai':[2,48]},'38':{'h':[2,47],'ah':[2,47],'k':[2,47],'l':[2,47],'m':[2,47],'n':[2,47],'o':[2,47],'p':[2,47],'q':[2,47],'r':[2,47],'s':[2,47],'t':[2,47],'u':[2,47],'v':[2,47],'w':[2,47],'j':[2,47],'ae':[2,47],'g':[2,47],'ag':[2,47],'ai':[2,47]},'39':{'h':[2,17],'j':[2,17],'ae':[2,17],'g':[2,17],'ai':[2,17]},'40':{'ae':[2,24],'g':[2,24]},'41':{'g':[1,undefined,74],'ae':[1,undefined,75]},'42':{'ag':[1,undefined,76]},'43':{'ag':[1,undefined,77]},'44':{'h':[2,19],'j':[2,19],'ae':[2,19],'g':[2,19],'ai':[2,19]},'45':{'g':[1,undefined,78],'ai':[1,undefined,79]},'46':{'ai':[2,22],'g':[2,22]},'47':{'a':[2,6],'e':[2,6],'c':[2,6],'f':[2,6],'b':[2,6],'d':[2,6]},'48':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'49':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'50':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'51':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'52':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'53':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'54':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'55':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'56':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'57':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'58':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'59':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'60':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'61':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'62':{'a':[2,1],'d':[2,1],'b':[1,undefined,1],'c':[1,undefined,2],'f':[1,undefined,3]},'63':{'d':[1,undefined,94]},'64':{'h':[2,11],'i':[2,11],'ac':[2,11],'ad':[2,11],'ah':[2,11],'k':[2,11],'l':[2,11],'m':[2,11],'n':[2,11],'o':[2,11],'p':[2,11],'q':[2,11],'r':[2,11],'s':[2,11],'t':[2,11],'u':[2,11],'v':[2,11],'w':[2,11],'j':[2,11],'ae':[2,11],'g':[2,11],'aa':[2,11],'ag':[2,11],'ai':[2,11]},'65':{'g':[2,52],'j':[2,52],'ah':[2,52],'k':[2,52],'l':[2,52],'m':[2,52],'n':[2,52],'o':[2,52],'p':[2,52],'q':[2,52],'r':[2,52],'s':[2,52],'t':[2,52],'u':[2,52],'v':[2,52],'w':[2,52],'i':[1,undefined,33],'aa':[1,undefined,95]},'66':{'g':[2,14],'j':[2,14]},'67':{'g':[1,undefined,96],'j':[1,undefined,97]},'68':{'g':[1,undefined,98],'j':[1,undefined,99]},'69':{'g':[2,13],'j':[2,13]},'70':{'j':[2,55],'g':[2,55]},'71':{'i':[2,59],'ac':[2,59],'ad':[2,59],'h':[2,59],'ah':[2,59],'k':[2,59],'l':[2,59],'m':[2,59],'n':[2,59],'o':[2,59],'p':[2,59],'q':[2,59],'r':[2,59],'s':[2,59],'t':[2,59],'u':[2,59],'v':[2,59],'w':[2,59],'j':[2,59],'ae':[2,59],'g':[2,59],'aa':[2,59],'ag':[2,59],'ai':[2,59]},'72':{'ae':[1,undefined,100]},'73':{'h':[2,53],'ah':[2,53],'k':[2,53],'l':[2,53],'m':[2,53],'n':[2,53],'o':[2,53],'p':[2,53],'q':[2,53],'r':[2,53],'s':[2,53],'t':[2,53],'u':[2,53],'v':[2,53],'w':[2,53],'j':[2,53],'ae':[2,53],'g':[2,53],'ag':[2,53],'ai':[2,53]},'74':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7],'ad':[1,undefined,16],'af':[1,undefined,17]},'75':{'h':[2,16],'j':[2,16],'ae':[2,16],'g':[2,16],'ai':[2,16]},'76':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7],'ad':[1,undefined,16],'af':[1,undefined,17]},'77':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7],'ad':[1,undefined,16],'af':[1,undefined,17]},'78':{'y':[1,undefined,42],'ab':[1,undefined,43]},'79':{'h':[2,18],'j':[2,18],'ae':[2,18],'g':[2,18],'ai':[2,18]},'80':{'h':[2,29],'ah':[2,29],'k':[2,29],'j':[2,29],'ae':[2,29],'g':[2,29],'ag':[2,29],'ai':[2,29],'l':[1,undefined,50]},'81':{'k':[1,undefined,48],'ag':[1,undefined,105]},'82':{'h':[2,31],'ah':[2,31],'k':[2,31],'l':[2,31],'j':[2,31],'ae':[2,31],'g':[2,31],'ag':[2,31],'ai':[2,31],'m':[1,undefined,51],'n':[1,undefined,52]},'83':{'h':[2,33],'ah':[2,33],'k':[2,33],'l':[2,33],'m':[2,33],'n':[2,33],'j':[2,33],'ae':[2,33],'g':[2,33],'ag':[2,33],'ai':[2,33],'o':[1,undefined,53],'p':[1,undefined,54],'q':[1,undefined,55],'r':[1,undefined,56]},'84':{'h':[2,34],'ah':[2,34],'k':[2,34],'l':[2,34],'m':[2,34],'n':[2,34],'j':[2,34],'ae':[2,34],'g':[2,34],'ag':[2,34],'ai':[2,34],'o':[1,undefined,53],'p':[1,undefined,54],'q':[1,undefined,55],'r':[1,undefined,56]},'85':{'h':[2,39],'ah':[2,39],'k':[2,39],'l':[2,39],'m':[2,39],'n':[2,39],'o':[2,39],'p':[2,39],'q':[2,39],'r':[2,39],'j':[2,39],'ae':[2,39],'g':[2,39],'ag':[2,39],'ai':[2,39],'s':[1,undefined,57],'t':[1,undefined,58]},'86':{'h':[2,38],'ah':[2,38],'k':[2,38],'l':[2,38],'m':[2,38],'n':[2,38],'o':[2,38],'p':[2,38],'q':[2,38],'r':[2,38],'j':[2,38],'ae':[2,38],'g':[2,38],'ag':[2,38],'ai':[2,38],'s':[1,undefined,57],'t':[1,undefined,58]},'87':{'h':[2,37],'ah':[2,37],'k':[2,37],'l':[2,37],'m':[2,37],'n':[2,37],'o':[2,37],'p':[2,37],'q':[2,37],'r':[2,37],'j':[2,37],'ae':[2,37],'g':[2,37],'ag':[2,37],'ai':[2,37],'s':[1,undefined,57],'t':[1,undefined,58]},'88':{'h':[2,36],'ah':[2,36],'k':[2,36],'l':[2,36],'m':[2,36],'n':[2,36],'o':[2,36],'p':[2,36],'q':[2,36],'r':[2,36],'j':[2,36],'ae':[2,36],'g':[2,36],'ag':[2,36],'ai':[2,36],'s':[1,undefined,57],'t':[1,undefined,58]},'89':{'h':[2,41],'ah':[2,41],'k':[2,41],'l':[2,41],'m':[2,41],'n':[2,41],'o':[2,41],'p':[2,41],'q':[2,41],'r':[2,41],'s':[2,41],'t':[2,41],'j':[2,41],'ae':[2,41],'g':[2,41],'ag':[2,41],'ai':[2,41],'u':[1,undefined,59],'v':[1,undefined,60],'w':[1,undefined,61]},'90':{'h':[2,42],'ah':[2,42],'k':[2,42],'l':[2,42],'m':[2,42],'n':[2,42],'o':[2,42],'p':[2,42],'q':[2,42],'r':[2,42],'s':[2,42],'t':[2,42],'j':[2,42],'ae':[2,42],'g':[2,42],'ag':[2,42],'ai':[2,42],'u':[1,undefined,59],'v':[1,undefined,60],'w':[1,undefined,61]},'91':{'h':[2,44],'ah':[2,44],'k':[2,44],'l':[2,44],'m':[2,44],'n':[2,44],'o':[2,44],'p':[2,44],'q':[2,44],'r':[2,44],'s':[2,44],'t':[2,44],'u':[2,44],'v':[2,44],'w':[2,44],'j':[2,44],'ae':[2,44],'g':[2,44],'ag':[2,44],'ai':[2,44]},'92':{'h':[2,45],'ah':[2,45],'k':[2,45],'l':[2,45],'m':[2,45],'n':[2,45],'o':[2,45],'p':[2,45],'q':[2,45],'r':[2,45],'s':[2,45],'t':[2,45],'u':[2,45],'v':[2,45],'w':[2,45],'j':[2,45],'ae':[2,45],'g':[2,45],'ag':[2,45],'ai':[2,45]},'93':{'h':[2,46],'ah':[2,46],'k':[2,46],'l':[2,46],'m':[2,46],'n':[2,46],'o':[2,46],'p':[2,46],'q':[2,46],'r':[2,46],'s':[2,46],'t':[2,46],'u':[2,46],'v':[2,46],'w':[2,46],'j':[2,46],'ae':[2,46],'g':[2,46],'ag':[2,46],'ai':[2,46]},'94':{'ab':[1,undefined,7]},'95':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7],'ad':[1,undefined,16],'af':[1,undefined,17]},'96':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7],'ad':[1,undefined,16],'af':[1,undefined,17]},'97':{'h':[2,9],'i':[2,9],'ac':[2,9],'ad':[2,9],'ah':[2,9],'k':[2,9],'l':[2,9],'m':[2,9],'n':[2,9],'o':[2,9],'p':[2,9],'q':[2,9],'r':[2,9],'s':[2,9],'t':[2,9],'u':[2,9],'v':[2,9],'w':[2,9],'j':[2,9],'ae':[2,9],'g':[2,9],'aa':[2,9],'ag':[2,9],'ai':[2,9]},'98':{'ab':[1,undefined,7]},'99':{'h':[2,10],'i':[2,10],'ac':[2,10],'ad':[2,10],'ah':[2,10],'k':[2,10],'l':[2,10],'m':[2,10],'n':[2,10],'o':[2,10],'p':[2,10],'q':[2,10],'r':[2,10],'s':[2,10],'t':[2,10],'u':[2,10],'v':[2,10],'w':[2,10],'j':[2,10],'ae':[2,10],'g':[2,10],'aa':[2,10],'ag':[2,10],'ai':[2,10]},'100':{'i':[2,60],'ac':[2,60],'ad':[2,60],'h':[2,60],'ah':[2,60],'k':[2,60],'l':[2,60],'m':[2,60],'n':[2,60],'o':[2,60],'p':[2,60],'q':[2,60],'r':[2,60],'s':[2,60],'t':[2,60],'u':[2,60],'v':[2,60],'w':[2,60],'j':[2,60],'ae':[2,60],'g':[2,60],'aa':[2,60],'ag':[2,60],'ai':[2,60]},'101':{'ae':[2,25],'g':[2,25]},'102':{'ai':[2,20],'g':[2,20]},'103':{'ai':[2,21],'g':[2,21]},'104':{'ai':[2,23],'g':[2,23]},'105':{'i':[1,undefined,11],'t':[1,undefined,12],'x':[1,undefined,13],'y':[1,undefined,14],'z':[1,undefined,15],'ab':[1,undefined,7]},'106':{'h':[1,undefined,113],'i':[1,undefined,33]},'107':{'j':[2,56],'g':[2,56]},'108':{'g':[1,undefined,98],'j':[1,undefined,114]},'109':{'g':[2,12],'j':[2,12]},'110':{'i':[1,undefined,33],'aa':[1,undefined,95]},'111':{'j':[2,54],'g':[2,54]},'112':{'h':[2,27],'j':[2,27],'ae':[2,27],'g':[2,27],'ai':[2,27]},'113':{'a':[2,5],'e':[2,5],'c':[2,5],'f':[2,5],'b':[2,5],'d':[2,5]},'114':{'h':[2,8],'i':[2,8],'ac':[2,8],'ad':[2,8],'ah':[2,8],'k':[2,8],'l':[2,8],'m':[2,8],'n':[2,8],'o':[2,8],'p':[2,8],'q':[2,8],'r':[2,8],'s':[2,8],'t':[2,8],'u':[2,8],'v':[2,8],'w':[2,8],'j':[2,8],'ae':[2,8],'g':[2,8],'aa':[2,8],'ag':[2,8],'ai':[2,8]}}};parser.parse=function parse(input,filename){var state,symbol,ret,action,$$;var self=this;var lexer=self.lexer;var table=self.table;var gotos=table.gotos;var tableAction=table.action;var productions=self.productions;// for debug info
// for debug info
var prefix=filename?'in file: '+filename+' ':'';var valueStack=[];var stateStack=[0];var symbolStack=[];lexer.resetInput(input);while(1){// retrieve state number from top of stack
state=peekStack(stateStack);if(!symbol){symbol=lexer.lex();}if(symbol){// read action for current state and first input
action=tableAction[state]&&tableAction[state][symbol];}else{action=null;}if(!action){var expected=[];var error;//#JSCOVERAGE_IF
//#JSCOVERAGE_IF
if(tableAction[state]){each(tableAction[state],function(v,symbolForState){action=v[GrammarConst.TYPE_INDEX];var map=[];map[GrammarConst.SHIFT_TYPE]='shift';map[GrammarConst.REDUCE_TYPE]='reduce';map[GrammarConst.ACCEPT_TYPE]='accept';expected.push(map[action]+':'+self.lexer.mapReverseSymbol(symbolForState));});}error=prefix+'syntax error at line '+lexer.lineNumber+':\n'+lexer.showDebugInfo()+'\n'+'expect '+expected.join(', ');throw new Error(error);}switch(action[GrammarConst.TYPE_INDEX]){case GrammarConst.SHIFT_TYPE:symbolStack.push(symbol);valueStack.push(lexer.text);// push state
// push state
stateStack.push(action[GrammarConst.TO_INDEX]);// allow to read more
// allow to read more
symbol=null;break;case GrammarConst.REDUCE_TYPE:var production=productions[action[GrammarConst.PRODUCTION_INDEX]];var reducedSymbol=production.symbol||production[0];var reducedAction=production.action||production[2];var reducedRhs=production.rhs||production[1];var len=reducedRhs.length;$$=peekStack(valueStack,len);// default to $$ = $1
// default to $$ = $1
ret=undefined;self.$$=$$;for(var i=0;i<len;i++){self['$'+(len-i)]=peekStack(valueStack,i+1);}if(reducedAction){ret=reducedAction.call(self);}if(ret!==undefined){$$=ret;}else{$$=self.$$;}var reverseIndex=len*-1;stateStack.splice(reverseIndex,len);valueStack.splice(reverseIndex,len);symbolStack.splice(reverseIndex,len);symbolStack.push(reducedSymbol);valueStack.push($$);var newState=gotos[peekStack(stateStack)][reducedSymbol];stateStack.push(newState);break;case GrammarConst.ACCEPT_TYPE:return $$;}}};return parser;}();if(typeof module!=='undefined'){module.exports=parser;}
},{}],5:[function(require,module,exports){
'use strict';

/**
 * compiler tools
 */
var doubleReg = /\\*"/g;
var singleReg = /\\*'/g;
var arrayPush = [].push;
var globals = {};
globals.undefined = globals.null = globals.true = globals.false = 1;

function genStackJudge(parts, data) {
  var count = arguments.length <= 2 || arguments[2] === undefined ? 0 : arguments[2];
  var lastVariable_ = arguments[3];

  if (!parts.length) {
    return data;
  }
  var lastVariable = lastVariable_ || data;
  var part0 = parts[0];
  var variable = 't' + count;
  return ['(' + data + ' != null ? ', genStackJudge(parts.slice(1), '(' + variable + ' = ' + (lastVariable + part0) + ')', count + 1, variable), ' : ', lastVariable, ')'].join('');
}

function accessVariable(loose, parts, topVariable, fullVariable) {
  return loose ? genStackJudge(parts.slice(1), topVariable) : fullVariable;
}

var tools = module.exports = {
  genStackJudge: genStackJudge,

  isGlobalId: function isGlobalId(node) {
    if (globals[node.string]) {
      return 1;
    }
    return 0;
  },
  chainedVariableRead: function chainedVariableRead(self, source, idParts, root, resolveUp, loose) {
    var strs = tools.convertIdPartsToRawAccessor(self, source, idParts);
    var parts = strs.parts;
    var part0 = parts[0];
    var scope = '';
    if (root) {
      scope = 'scope.root.';
    }
    var affix = scope + 'affix';
    var data = scope + 'data';
    var ret = ['(', '(t=(' + (affix + part0) + ')) !== undefined ? ', idParts.length > 1 ? accessVariable(loose, parts, 't', affix + strs.str) : 't', ' : '];
    if (resolveUp) {
      ret = ret.concat(['(', '(t = ' + (data + part0) + ') !== undefined ? ', idParts.length > 1 ? accessVariable(loose, parts, 't', data + strs.str) : 't', '  : ', loose ? 'scope.resolveLooseUp(' + strs.arr + ')' : 'scope.resolveUp(' + strs.arr + ')', ')']);
    } else {
      ret.push(accessVariable(loose, parts, data + part0, data + strs.str));
    }
    ret.push(')');
    return ret.join('');
  },
  convertIdPartsToRawAccessor: function convertIdPartsToRawAccessor(self, source, idParts) {
    var i = void 0;
    var l = void 0;
    var idPart = void 0;
    var idPartType = void 0;
    var nextIdNameCode = void 0;
    var parts = [];
    var ret = [];
    var funcRet = '';
    for (i = 0, l = idParts.length; i < l; i++) {
      idPart = idParts[i];
      idPartType = idPart.type;
      if (idPartType) {
        nextIdNameCode = self[idPartType](idPart);
        tools.pushToArray(source, nextIdNameCode.source);
        if (idPartType === 'function') {
          funcRet = 1;
        }
        ret.push('[ ' + nextIdNameCode.exp + ' ]');
        parts.push(nextIdNameCode.exp);
      } else {
        // literal a.x
        ret.push('.' + idPart);
        parts.push(tools.wrapByDoubleQuote(idPart));
      }
    }
    // y().z() =>
    // var a = y();
    // a['z']
    return {
      str: ret.join(''),
      arr: '[' + parts.join(',') + ']',
      parts: ret, funcRet: funcRet,
      resolvedParts: parts
    };
  },
  wrapByDoubleQuote: function wrapByDoubleQuote(str) {
    return '"' + str + '"';
  },
  wrapBySingleQuote: function wrapBySingleQuote(str) {
    return '\'' + str + '\'';
  },
  joinArrayOfString: function joinArrayOfString(arr) {
    return tools.wrapByDoubleQuote(arr.join('","'));
  },
  escapeSingleQuoteInCodeString: function escapeSingleQuoteInCodeString(str, isDouble) {
    return str.replace(isDouble ? doubleReg : singleReg, function (m_) {
      var m = m_;
      // \ 's number ，用户显式转过 "\'" , "\\\'" 就不处理了，否则手动对 ` 加 \ 转义
      if (m.length % 2) {
        m = '\\' + m;
      }
      return m;
    });
  },
  escapeString: function escapeString(str_, isCode) {
    var str = str_;
    if (isCode) {
      str = tools.escapeSingleQuoteInCodeString(str, 0);
    } else {
      str = str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }
    str = str.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
    return str;
  },
  pushToArray: function pushToArray(to, from) {
    if (from) {
      arrayPush.apply(to, from);
    }
  }
};
},{}],6:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

/**
 * simple facade for runtime and compiler
 */

var XTemplateRuntime = require('./runtime');
var util = XTemplateRuntime.util;
var Compiler = require('./compiler');
var _compile = Compiler.compile;

/**
 * xtemplate engine
 *
 *      @example
 *      modulex.use('xtemplate', function(XTemplate){
 *          document.writeln(new XTemplate('{{title}}').render({title:2}));
 *      });
 *
 * @class XTemplate
 * @extends XTemplate.Runtime
 */
function XTemplate(tpl_, config_) {
  var tpl = tpl_;
  var config = config_;
  var tplType = typeof tpl === 'undefined' ? 'undefined' : _typeof(tpl);
  if (tplType !== 'string' && tplType !== 'function') {
    config = tpl;
    tpl = undefined;
  }
  config = this.config = util.merge(XTemplate.globalConfig, config);
  if (tplType === 'string') {
    try {
      tpl = this.compile(tpl, config.name);
    } catch (err) {
      this.compileError = err;
    }
  }
  XTemplateRuntime.call(this, tpl, config);
}

function Noop() {}

Noop.prototype = XTemplateRuntime.prototype;
XTemplate.prototype = new Noop();
XTemplate.prototype.constructor = XTemplate;

util.mix(XTemplate.prototype, {
  compile: function compile(content, name) {
    return _compile(content, name, this.config);
  },
  render: function render(data, option, callback_) {
    var callback = callback_;
    if (typeof option === 'function') {
      callback = option;
    }
    var compileError = this.compileError;
    if (compileError) {
      if (callback) {
        callback(compileError);
      } else {
        throw compileError;
      }
    } else {
      return XTemplateRuntime.prototype.render.apply(this, arguments);
    }
  }
});

module.exports = util.mix(XTemplate, {
  globalConfig: {},

  config: XTemplateRuntime.config,

  compile: _compile,

  Compiler: Compiler,

  Scope: XTemplateRuntime.Scope,

  Runtime: XTemplateRuntime,

  /**
   * add command to all template
   * @method
   * @static
   * @param {String} commandName
   * @param {Function} fn
   */
  addCommand: XTemplateRuntime.addCommand,

  /**
   * remove command from all template by name
   * @method
   * @static
   * @param {String} commandName
   */
  removeCommand: XTemplateRuntime.removeCommand
});

/*
 It consists three modules:

 -   xtemplate - Both compiler and runtime functionality.
 -   xtemplate/compiler - Compiler string template to module functions.
 -   xtemplate/runtime -  Runtime for string template( with xtemplate/compiler loaded)
 or template functions.

 xtemplate/compiler depends on xtemplate/runtime,
 because compiler needs to know about runtime to generate corresponding codes.
 */
},{"./compiler":2,"./runtime":7}],7:[function(require,module,exports){
'use strict';

/**
 * xtemplate runtime
 */
var util = require('./runtime/util');
var nativeCommands = require('./runtime/commands');
var commands = {};
var Scope = require('./runtime/scope');
var LinkedBuffer = require('./runtime/linked-buffer');

// for performance: reduce hidden class
function TplWrap(name, runtime, root, scope, buffer, originalName, fn, parent) {
  this.name = name;
  this.originalName = originalName || name;
  this.runtime = runtime;
  this.root = root;
  // line counter
  this.pos = { line: 1 };
  this.scope = scope;
  this.buffer = buffer;
  this.fn = fn;
  this.parent = parent;
}

function findCommand(runtimeCommands, instanceCommands, parts) {
  var name = parts[0];
  var cmd = runtimeCommands && runtimeCommands[name] || instanceCommands && instanceCommands[name] || commands[name];
  if (parts.length === 1) {
    return cmd;
  }
  if (cmd) {
    var len = parts.length;
    for (var i = 1; i < len; i++) {
      cmd = cmd[parts[i]];
      if (!cmd) {
        return false;
      }
    }
  }
  return cmd;
}

function getSubNameFromParentName(parentName, subName) {
  var parts = parentName.split('/');
  var subParts = subName.split('/');
  parts.pop();
  for (var i = 0, l = subParts.length; i < l; i++) {
    var subPart = subParts[i];
    if (subPart === '.') {
      continue;
    } else if (subPart === '..') {
      parts.pop();
    } else {
      parts.push(subPart);
    }
  }
  return parts.join('/');
}

// depth: ../x.y() => 1
function callFn(tpl, scope, option, buffer, parts, depth) {
  var caller = void 0;
  var fn = void 0;
  var command1 = void 0;
  if (!depth) {
    command1 = findCommand(tpl.runtime.commands, tpl.root.config.commands, parts);
  }
  if (command1) {
    return command1.call(tpl, scope, option, buffer);
  } else if (command1 !== false) {
    var callerParts = parts.slice(0, -1);
    caller = scope.resolve(callerParts, depth);
    if (caller === null || caller === undefined) {
      buffer.error('Execute function `' + parts.join('.') + '` Error: ' + callerParts.join('.') + ' is undefined or null');
      return buffer;
    }
    fn = caller[parts[parts.length - 1]];
    if (fn) {
      // apply(x, undefined) error in ie8
      try {
        return fn.apply(caller, option.params || []);
      } catch (err) {
        buffer.error('Execute function `' + parts.join('.') + '` Error: ' + err.message);
        return buffer;
      }
    }
  }
  buffer.error('Command Not Found: ' + parts.join('.'));
  return buffer;
}

var utils = {
  callFn: callFn,

  // {{y().z()}}
  callDataFn: function callDataFn(params, parts) {
    var caller = parts[0];
    var fn = caller;
    for (var i = 1; i < parts.length; i++) {
      var name = parts[i];
      if (fn && fn[name]) {
        caller = fn;
        fn = fn[name];
      } else {
        return '';
      }
    }
    return fn.apply(caller, params || []);
  },
  callCommand: function callCommand(tpl, scope, option, buffer, parts) {
    return callFn(tpl, scope, option, buffer, parts);
  }
};

/**
 * template file name for chrome debug
 *
 * @cfg {Boolean} name
 * @member XTemplate.Runtime
 */

/**
 * XTemplate runtime. only accept tpl as function.
 * @class XTemplate.Runtime
 */
function XTemplateRuntime(fn, config) {
  this.fn = fn;
  this.config = util.merge(XTemplateRuntime.globalConfig, config);
  this.subNameResolveCache = {};
  this.loadedSubTplNames = {};
}

util.mix(XTemplateRuntime, {
  Scope: Scope,

  LinkedBuffer: LinkedBuffer,

  globalConfig: {},

  config: function config(key, v) {
    var globalConfig = this.globalConfig;

    if (key !== undefined) {
      if (v !== undefined) {
        globalConfig[key] = v;
      } else {
        util.mix(globalConfig, key);
      }
    } else {
      return globalConfig;
    }
  },


  nativeCommands: nativeCommands,

  utils: utils,

  util: util,

  /**
   * add command to all template
   * @method
   * @static
   * @param {String} commandName
   * @param {Function} fn
   * @member XTemplate.Runtime
   */
  addCommand: function addCommand(commandName, fn) {
    commands[commandName] = fn;
  },


  /**
   * remove command from all template by name
   * @method
   * @static
   * @param {String} commandName
   * @member XTemplate.Runtime
   */
  removeCommand: function removeCommand(commandName) {
    delete commands[commandName];
  }
});

function resolve(root, subName_, parentName) {
  var subName = subName_;
  if (subName.charAt(0) !== '.') {
    return subName;
  }
  var key = parentName + '_ks_' + subName;
  var nameResolveCache = root.subNameResolveCache;
  var cached = nameResolveCache[key];
  if (cached) {
    return cached;
  }
  subName = nameResolveCache[key] = getSubNameFromParentName(parentName, subName);
  return subName;
}

function loadInternal(root, name, runtime, scope, buffer, originalName, escape, parentTpl) {
  var tpl = new TplWrap(name, runtime, root, scope, buffer, originalName, undefined, parentTpl);
  buffer.tpl = tpl;
  root.config.loader.load(tpl, function (error, tplFn_) {
    var tplFn = tplFn_;
    if (typeof tplFn === 'function') {
      tpl.fn = tplFn;
      // reduce count of object field for performance
      /* eslint no-use-before-define:0 */
      renderTpl(tpl);
    } else if (error) {
      buffer.error(error);
    } else {
      tplFn = tplFn || '';
      if (escape) {
        buffer.writeEscaped(tplFn);
      } else {
        buffer.data += tplFn;
      }
      buffer.end();
    }
  });
}

function includeInternal(root, scope, escape, buffer, tpl, originalName) {
  var name = resolve(root, originalName, tpl.name);
  var newBuffer = buffer.insert();
  var next = newBuffer.next;
  loadInternal(root, name, tpl.runtime, scope, newBuffer, originalName, escape, buffer.tpl);
  return next;
}

function includeModuleInternal(root, scope, buffer, tpl, tplFn) {
  var newBuffer = buffer.insert();
  var next = newBuffer.next;
  var newTpl = new TplWrap(tplFn.TPL_NAME, tpl.runtime, root, scope, newBuffer, undefined, tplFn, buffer.tpl);
  newBuffer.tpl = newTpl;
  renderTpl(newTpl);
  return next;
}

function renderTpl(tpl) {
  var buffer = tpl.fn();
  // tpl.fn exception
  if (buffer) {
    var runtime = tpl.runtime;
    var extendTpl = runtime.extendTpl;
    var extendTplName = void 0;
    if (extendTpl) {
      extendTplName = extendTpl.params[0];
      if (!extendTplName) {
        return buffer.error('extend command required a non-empty parameter');
      }
    }
    var extendTplFn = runtime.extendTplFn;
    var extendTplBuffer = runtime.extendTplBuffer;
    // if has extend statement, only parse
    if (extendTplFn) {
      runtime.extendTpl = null;
      runtime.extendTplBuffer = null;
      runtime.extendTplFn = null;
      includeModuleInternal(tpl.root, tpl.scope, extendTplBuffer, tpl, extendTplFn).end();
    } else if (extendTplName) {
      runtime.extendTpl = null;
      runtime.extendTplBuffer = null;
      includeInternal(tpl.root, tpl.scope, 0, extendTplBuffer, tpl, extendTplName).end();
    }
    return buffer.end();
  }
}

function getIncludeScope(scope, option, buffer) {
  var params = option.params;
  if (!params[0]) {
    return buffer.error('include command required a non-empty parameter');
  }
  var newScope = scope;
  var newScopeData = params[1];
  var hash = option.hash;
  if (hash) {
    if (newScopeData) {
      newScopeData = util.mix({}, newScopeData);
    } else {
      newScopeData = {};
    }
    util.mix(newScopeData, hash);
  }
  // sub template scope
  if (newScopeData) {
    newScope = new Scope(newScopeData, undefined, scope);
  }
  return newScope;
}

function checkIncludeOnce(root, option, tpl) {
  var originalName = option.params[0];
  var name = resolve(root, originalName, tpl.name);
  var loadedSubTplNames = root.loadedSubTplNames;

  if (loadedSubTplNames[name]) {
    return false;
  }
  loadedSubTplNames[name] = true;
  return true;
}

XTemplateRuntime.prototype = {
  constructor: XTemplateRuntime,

  Scope: Scope,

  nativeCommands: nativeCommands,

  utils: utils,

  /**
   * remove command by name
   * @param commandName
   */
  removeCommand: function removeCommand(commandName) {
    var config = this.config;
    if (config.commands) {
      delete config.commands[commandName];
    }
  },


  /**
   * add command definition to current template
   * @param commandName
   * @param {Function} fn command definition
   */
  addCommand: function addCommand(commandName, fn) {
    var config = this.config;
    config.commands = config.commands || {};
    config.commands[commandName] = fn;
  },
  include: function include(scope, option, buffer, tpl) {
    return includeInternal(this, getIncludeScope(scope, option, buffer), option.escape, buffer, tpl, option.params[0]);
  },
  includeModule: function includeModule(scope, option, buffer, tpl) {
    return includeModuleInternal(this, getIncludeScope(scope, option, buffer), buffer, tpl, option.params[0]);
  },
  includeOnce: function includeOnce(scope, option, buffer, tpl) {
    if (checkIncludeOnce(this, option, tpl)) {
      return this.include(scope, option, buffer, tpl);
    }
    return buffer;
  },
  includeOnceModule: function includeOnceModule(scope, option, buffer, tpl) {
    if (checkIncludeOnce(this, option, tpl)) {
      return this.includeModule(scope, option, buffer, tpl);
    }
    return buffer;
  },


  /**
   * get result by merge data with template
   */
  render: function render(data, option_, callback_) {
    var _this = this;

    var option = option_;
    var callback = callback_;
    var html = '';
    var fn = this.fn;
    var config = this.config;
    if (typeof option === 'function') {
      callback = option;
      option = null;
    }
    option = option || {};
    if (!callback) {
      callback = function callback(error_, ret) {
        var error = error_;
        if (error) {
          if (!(error instanceof Error)) {
            error = new Error(error);
          }
          throw error;
        }
        html = ret;
      };
    }
    var name = this.config.name;
    if (!name && fn && fn.TPL_NAME) {
      name = fn.TPL_NAME;
    }
    var scope = void 0;
    if (data instanceof Scope) {
      scope = data;
    } else {
      scope = new Scope(data);
    }
    var buffer = new LinkedBuffer(callback, config).head;
    var tpl = new TplWrap(name, {
      commands: option.commands
    }, this, scope, buffer, name, fn);
    buffer.tpl = tpl;
    if (!fn) {
      config.loader.load(tpl, function (err, fn2) {
        if (fn2) {
          tpl.fn = _this.fn = fn2;
          renderTpl(tpl);
        } else if (err) {
          buffer.error(err);
        }
      });
      return html;
    }
    renderTpl(tpl);
    return html;
  }
};

module.exports = XTemplateRuntime;

/**
 * @ignore
 *
 * 2012-09-12 yiminghe@gmail.com
 *  - 参考 velocity, 扩充 ast
 *  - Expression/ConditionalOrExpression
 *  - EqualityExpression/RelationalExpression...
 *
 * 2012-09-11 yiminghe@gmail.com
 *  - 初步完成，添加 tc
 *
 * 对比 template
 *
 *  优势
 *      - 不会莫名其妙报错（with）
 *      - 更多出错信息，直接给出行号
 *      - 更容易扩展 command, sub-tpl
 *      - 支持子模板
 *      - 支持作用域链: ..\x ..\..\y
 *      - 内置 escapeHtml 支持
 *      - 支持预编译
 *      - 支持简单表达式 +-/%* ()
 *      - 支持简单比较 === !===
 *      - 支持类似函数的嵌套命令
 *   劣势
 *      - 不支持完整 js 语法
 */
},{"./runtime/commands":8,"./runtime/linked-buffer":9,"./runtime/scope":10,"./runtime/util":11}],8:[function(require,module,exports){
'use strict';

/**
 * native commands for xtemplate.
 */

var Scope = require('./scope');
var util = require('./util');
var commands = {
  // range(start, stop, [step])
  range: function range(scope, option) {
    var params = option.params;
    var start = params[0];
    var end = params[1];
    var step = params[2];
    if (!step) {
      step = start > end ? -1 : 1;
    } else if (start > end && step > 0 || start < end && step < 0) {
      step = -step;
    }
    var ret = [];
    for (var i = start; start < end ? i < end : i > end; i += step) {
      ret.push(i);
    }
    return ret;
  },
  "void": function _void() {
    return undefined;
  },
  foreach: function foreach(scope, option, buffer_) {
    var buffer = buffer_;
    var params = option.params;
    var param0 = params[0];
    var xindexName = params[2] || 'xindex';
    var valueName = params[1];
    var xcount = void 0;
    var opScope = void 0;
    var affix = void 0;
    var xindex = void 0;
    if (param0) {
      xcount = param0.length;
      for (xindex = 0; xindex < xcount; xindex++) {
        opScope = new Scope(param0[xindex], {
          xcount: xcount,
          xindex: xindex
        }, scope);
        affix = opScope.affix;
        if (xindexName !== 'xindex') {
          affix[xindexName] = xindex;
          affix.xindex = undefined;
        }
        if (valueName) {
          affix[valueName] = param0[xindex];
        }
        buffer = option.fn(opScope, buffer);
      }
    }
    return buffer;
  },
  forin: function forin(scope, option, buffer_) {
    var buffer = buffer_;
    var params = option.params;
    var param0 = params[0];
    var xindexName = params[2] || 'xindex';
    var valueName = params[1];
    var opScope = void 0;
    var affix = void 0;
    var name = void 0;
    // if undefined, will emit warning by compiler
    if (param0) {
      for (name in param0) {
        if (param0.hasOwnProperty(name)) {
          opScope = new Scope(param0[name], {
            xindex: name
          }, scope);
          affix = opScope.affix;
          if (xindexName !== 'xindex') {
            affix[xindexName] = name;
            affix.xindex = undefined;
          }
          if (valueName) {
            affix[valueName] = param0[name];
          }
          buffer = option.fn(opScope, buffer);
        }
      }
    }
    return buffer;
  },
  each: function each(scope, option, buffer) {
    var params = option.params;
    var param0 = params[0];
    if (param0) {
      if (util.isArray(param0)) {
        return commands.foreach(scope, option, buffer);
      }
      return commands.forin(scope, option, buffer);
    }
    return buffer;
  },
  'with': function _with(scope, option, buffer_) {
    var buffer = buffer_;
    var params = option.params;
    var param0 = params[0];
    if (param0) {
      // skip object check for performance
      var opScope = new Scope(param0, undefined, scope);
      buffer = option.fn(opScope, buffer);
    }
    return buffer;
  },
  'if': function _if(scope, option, buffer_) {
    var buffer = buffer_;
    var params = option.params;
    var param0 = params[0];
    if (param0) {
      var fn = option.fn;
      if (fn) {
        buffer = fn(scope, buffer);
      }
    } else {
      var matchElseIf = false;
      var elseIfs = option.elseIfs;
      var inverse = option.inverse;
      if (elseIfs) {
        for (var i = 0, len = elseIfs.length; i < len; i++) {
          var elseIf = elseIfs[i];
          matchElseIf = elseIf.test(scope);
          if (matchElseIf) {
            buffer = elseIf.fn(scope, buffer);
            break;
          }
        }
      }
      if (!matchElseIf && inverse) {
        buffer = inverse(scope, buffer);
      }
    }
    return buffer;
  },
  set: function set(scope_, option, buffer) {
    var scope = scope_;
    var hash = option.hash;
    var len = hash.length;
    for (var i = 0; i < len; i++) {
      var h = hash[i];
      var parts = h.key;
      var depth = h.depth;
      var value = h.value;
      if (parts.length === 1) {
        var root = scope.root;
        while (depth && root !== scope) {
          scope = scope.parent;
          --depth;
        }
        scope.set(parts[0], value);
      } else {
        var last = scope.resolve(parts.slice(0, -1), depth);
        if (last) {
          last[parts[parts.length - 1]] = value;
        }
      }
    }
    return buffer;
  },


  include: 1,

  includeOnce: 1,

  parse: 1,

  extend: 1,

  block: function block(scope, option, buffer_) {
    var buffer = buffer_;
    var self = this;
    var runtime = self.runtime;
    var params = option.params;
    var blockName = params[0];
    var type = void 0;
    if (params.length === 2) {
      type = params[0];
      blockName = params[1];
    }
    var blocks = runtime.blocks = runtime.blocks || {};
    var head = blocks[blockName];
    var cursor = void 0;
    var current = {
      fn: option.fn,
      type: type
    };
    if (!head) {
      blocks[blockName] = current;
    } else if (head.type) {
      if (head.type === 'append') {
        current.next = head;
        blocks[blockName] = current;
      } else if (head.type === 'prepend') {
        var prev = void 0;
        cursor = head;
        while (cursor && cursor.type === 'prepend') {
          prev = cursor;
          cursor = cursor.next;
        }
        current.next = cursor;
        prev.next = current;
      }
    }

    if (!runtime.extendTpl) {
      cursor = blocks[blockName];
      while (cursor) {
        if (cursor.fn) {
          buffer = cursor.fn.call(self, scope, buffer);
        }
        cursor = cursor.next;
      }
    }

    return buffer;
  },
  macro: function macro(scope, option, buffer_) {
    var buffer = buffer_;
    var hash = option.hash;
    var params = option.params;
    var macroName = params[0];
    var params1 = params.slice(1);
    var self = this;
    var runtime = self.runtime;
    var macros = runtime.macros = runtime.macros || {};
    var macro = macros[macroName];
    // definition
    if (option.fn) {
      macros[macroName] = {
        paramNames: params1,
        hash: hash,
        fn: option.fn
      };
    } else if (macro) {
      var paramValues = macro.hash || {};
      var paramNames = macro.paramNames;
      if (paramNames) {
        for (var i = 0, len = paramNames.length; i < len; i++) {
          var p = paramNames[i];
          paramValues[p] = params1[i];
        }
      }
      if (hash) {
        for (var h in hash) {
          if (hash.hasOwnProperty(h)) {
            paramValues[h] = hash[h];
          }
        }
      }
      var newScope = new Scope(paramValues);
      // https://github.com/xtemplate/xtemplate/issues/29
      newScope.root = scope.root;
      // no caller Scope
      buffer = macro.fn.call(self, newScope, buffer);
    } else {
      var error = 'can not find macro: ' + macroName;
      buffer.error(error);
    }
    return buffer;
  }
};

commands["debugger"] = function debuggerFn() {
  util.globalEval('debugger');
};

module.exports = commands;
},{"./scope":10,"./util":11}],9:[function(require,module,exports){
'use strict';

/**
 * LinkedBuffer of generate content from xtemplate
 */
var util = require('./util');

function Buffer(list, next, tpl) {
  this.list = list;
  this.init();
  this.next = next;
  this.ready = false;
  // tpl belongs
  this.tpl = tpl;
}

Buffer.prototype = {
  constructor: Buffer,

  isBuffer: 1,

  init: function init() {
    this.data = '';
  },
  append: function append(data) {
    this.data += data;
    return this;
  },
  write: function write(data) {
    // ignore null or undefined
    if (data !== null && data !== undefined) {
      if (data.isBuffer) {
        return data;
      }
      this.data += data;
    }
    return this;
  },
  writeEscaped: function writeEscaped(data) {
    // ignore null or undefined
    if (data !== null && data !== undefined) {
      if (data.isBuffer) {
        return data;
      }
      this.data += util.escapeHtml(data);
    }
    return this;
  },
  insert: function insert() {
    var self = this;
    var list = self.list;
    var tpl = self.tpl;
    var nextFragment = new Buffer(list, self.next, tpl);
    var asyncFragment = new Buffer(list, nextFragment, tpl);
    self.next = asyncFragment;
    self.ready = true;
    return asyncFragment;
  },
  async: function async(fn) {
    var asyncFragment = this.insert();
    var nextFragment = asyncFragment.next;
    fn(asyncFragment);
    return nextFragment;
  },
  error: function error(e_) {
    var callback = this.list.callback;
    var e = e_;
    if (callback) {
      var tpl = this.tpl;
      if (tpl) {
        if (!(e instanceof Error)) {
          e = new Error(e);
        }
        var name = tpl.name;
        var line = tpl.pos.line;
        var errorStr = 'XTemplate error in file: ' + name + ' at line ' + line + ': ';
        try {
          // phantomjs
          e.stack = errorStr + e.stack;
          e.message = errorStr + e.message;
        } catch (e2) {
          // empty
        }
        e.xtpl = {
          pos: {
            line: line
          },
          name: name
        };
      }
      this.list.callback = null;
      callback(e, undefined);
    }
  },
  end: function end() {
    var self = this;
    if (self.list.callback) {
      self.ready = true;
      self.list.flush();
    }
    return self;
  }
};

function LinkedBuffer(callback, config) {
  var self = this;
  self.config = config;
  self.head = new Buffer(self, undefined);
  self.callback = callback;
  this.init();
}

LinkedBuffer.prototype = {
  constructor: LinkedBuffer,

  init: function init() {
    this.data = '';
  },
  append: function append(data) {
    this.data += data;
  },
  end: function end() {
    this.callback(null, this.data);
    this.callback = null;
  },
  flush: function flush() {
    var self = this;
    var fragment = self.head;
    while (fragment) {
      if (fragment.ready) {
        this.data += fragment.data;
      } else {
        self.head = fragment;
        return;
      }
      fragment = fragment.next;
    }
    self.end();
  }
};

LinkedBuffer.Buffer = Buffer;

module.exports = LinkedBuffer;

/**
 * 2014-06-19 yiminghe@gmail.com
 * string concat is faster than array join: 85ms<-> 131ms
 */
},{"./util":11}],10:[function(require,module,exports){
'use strict';

/**
 * scope resolution for xtemplate like function in javascript but keep original data unmodified
 */

function Scope(data, affix, parent) {
  if (data !== undefined) {
    this.data = data;
  } else {
    this.data = {};
  }
  if (parent) {
    this.parent = parent;
    this.root = parent.root;
  } else {
    this.parent = undefined;
    this.root = this;
  }
  this.affix = affix || {};
  this.ready = false;
}

Scope.prototype = {
  isScope: 1,

  constructor: Scope,

  setParent: function setParent(parentScope) {
    this.parent = parentScope;
    this.root = parentScope.root;
  },


  // keep original data unmodified
  set: function set(name, value) {
    this.affix[name] = value;
  },
  setData: function setData(data) {
    this.data = data;
  },
  getData: function getData() {
    return this.data;
  },
  mix: function mix(v) {
    var affix = this.affix;
    for (var name in v) {
      if (v.hasOwnProperty(name)) {
        affix[name] = v[name];
      }
    }
  },
  get: function get(name) {
    var data = this.data;
    var v = void 0;
    var affix = this.affix;

    if (data !== null && data !== undefined) {
      v = data[name];
    }

    if (v !== undefined) {
      return v;
    }

    return affix[name];
  },
  resolveInternalOuter: function resolveInternalOuter(parts) {
    var part0 = parts[0];
    var v = void 0;
    var self = this;
    var scope = self;
    if (part0 === 'this') {
      v = self.data;
    } else if (part0 === 'root') {
      scope = scope.root;
      v = scope.data;
    } else if (part0) {
      /* eslint no-cond-assign:0 */
      do {
        v = scope.get(part0);
      } while (v === undefined && (scope = scope.parent));
    } else {
      return [scope.data];
    }
    return [undefined, v];
  },
  resolveInternal: function resolveInternal(parts) {
    var ret = this.resolveInternalOuter(parts);
    if (ret.length === 1) {
      return ret[0];
    }
    var i = void 0;
    var len = parts.length;
    var v = ret[1];
    if (v === undefined) {
      return undefined;
    }
    for (i = 1; i < len; i++) {
      if (v === null || v === undefined) {
        return v;
      }
      v = v[parts[i]];
    }
    return v;
  },
  resolveLooseInternal: function resolveLooseInternal(parts) {
    var ret = this.resolveInternalOuter(parts);
    if (ret.length === 1) {
      return ret[0];
    }
    var i = void 0;
    var len = parts.length;
    var v = ret[1];
    for (i = 1; v !== null && v !== undefined && i < len; i++) {
      v = v[parts[i]];
    }
    return v;
  },
  resolveUp: function resolveUp(parts) {
    return this.parent && this.parent.resolveInternal(parts);
  },
  resolveLooseUp: function resolveLooseUp(parts) {
    return this.parent && this.parent.resolveLooseInternal(parts);
  },
  resolveOuter: function resolveOuter(parts, d) {
    var self = this;
    var scope = self;
    var depth = d;
    var v = void 0;
    if (!depth && parts.length === 1) {
      v = self.get(parts[0]);
      if (v !== undefined) {
        return [v];
      }
      depth = 1;
    }
    if (depth) {
      while (scope && depth--) {
        scope = scope.parent;
      }
    }
    if (!scope) {
      return [undefined];
    }
    return [undefined, scope];
  },
  resolveLoose: function resolveLoose(parts, depth) {
    var ret = this.resolveOuter(parts, depth);
    if (ret.length === 1) {
      return ret[0];
    }
    return ret[1].resolveLooseInternal(parts);
  },
  resolve: function resolve(parts, depth) {
    var ret = this.resolveOuter(parts, depth);
    if (ret.length === 1) {
      return ret[0];
    }
    return ret[1].resolveInternal(parts);
  }
};

module.exports = Scope;
},{}],11:[function(require,module,exports){
(function (global){
'use strict';

// http://www.owasp.org/index.php/XSS_(Cross_Site_Scripting)_Prevention_Cheat_Sheet
// http://wonko.com/post/html-escaping

var escapeHtml = require('escape-html');

var SUBSTITUTE_REG = /\\?\{([^{}]+)\}/g;
var win = typeof global !== 'undefined' ? global : window;

var util = void 0;
var toString = Object.prototype.toString;
module.exports = util = {
  isArray: Array.isArray || function isArray(obj) {
    return toString.call(obj) === '[object Array]';
  },

  keys: Object.keys || function keys(o) {
    var result = [];
    var p = void 0;

    for (p in o) {
      if (o.hasOwnProperty(p)) {
        result.push(p);
      }
    }

    return result;
  },

  each: function each(object, fn) {
    var context = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];

    if (object) {
      var key = void 0;
      var val = void 0;
      var keys = void 0;
      var i = 0;
      var length = object && object.length;
      // do not use typeof obj == 'function': bug in phantomjs
      var isObj = length === undefined || Object.prototype.toString.call(object) === '[object Function]';

      if (isObj) {
        keys = util.keys(object);
        for (; i < keys.length; i++) {
          key = keys[i];
          // can not use hasOwnProperty
          if (fn.call(context, object[key], key, object) === false) {
            break;
          }
        }
      } else {
        for (val = object[0]; i < length; val = object[++i]) {
          if (fn.call(context, val, i, object) === false) {
            break;
          }
        }
      }
    }
    return object;
  },
  mix: function mix(t, s) {
    if (s) {
      for (var p in s) {
        if (s.hasOwnProperty(p)) {
          t[p] = s[p];
        }
      }
    }
    return t;
  },
  globalEval: function globalEval(data) {
    if (win.execScript) {
      win.execScript(data);
    } else {
      /* eslint wrap-iife:0 */
      (function run(d) {
        win.eval.call(win, d);
      })(data);
    }
  },
  substitute: function substitute(str, o, regexp) {
    if (typeof str !== 'string' || !o) {
      return str;
    }

    return str.replace(regexp || SUBSTITUTE_REG, function (match, name) {
      if (match.charAt(0) === '\\') {
        return match.slice(1);
      }
      return o[name] === undefined ? '' : o[name];
    });
  },


  escapeHtml: escapeHtml,

  merge: function merge() {
    var i = 0;
    var len = arguments.length;
    var ret = {};
    for (; i < len; i++) {
      var arg = arguments.length <= i + 0 ? undefined : arguments[i + 0];
      if (arg) {
        util.mix(ret, arg);
      }
    }
    return ret;
  }
};
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"escape-html":1}],12:[function(require,module,exports){
/*! jQuery v3.2.1 | (c) JS Foundation and other contributors | jquery.org/license */
!function(a,b){"use strict";"object"==typeof module&&"object"==typeof module.exports?module.exports=a.document?b(a,!0):function(a){if(!a.document)throw new Error("jQuery requires a window with a document");return b(a)}:b(a)}("undefined"!=typeof window?window:this,function(a,b){"use strict";var c=[],d=a.document,e=Object.getPrototypeOf,f=c.slice,g=c.concat,h=c.push,i=c.indexOf,j={},k=j.toString,l=j.hasOwnProperty,m=l.toString,n=m.call(Object),o={};function p(a,b){b=b||d;var c=b.createElement("script");c.text=a,b.head.appendChild(c).parentNode.removeChild(c)}var q="3.2.1",r=function(a,b){return new r.fn.init(a,b)},s=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,t=/^-ms-/,u=/-([a-z])/g,v=function(a,b){return b.toUpperCase()};r.fn=r.prototype={jquery:q,constructor:r,length:0,toArray:function(){return f.call(this)},get:function(a){return null==a?f.call(this):a<0?this[a+this.length]:this[a]},pushStack:function(a){var b=r.merge(this.constructor(),a);return b.prevObject=this,b},each:function(a){return r.each(this,a)},map:function(a){return this.pushStack(r.map(this,function(b,c){return a.call(b,c,b)}))},slice:function(){return this.pushStack(f.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(a){var b=this.length,c=+a+(a<0?b:0);return this.pushStack(c>=0&&c<b?[this[c]]:[])},end:function(){return this.prevObject||this.constructor()},push:h,sort:c.sort,splice:c.splice},r.extend=r.fn.extend=function(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=!1;for("boolean"==typeof g&&(j=g,g=arguments[h]||{},h++),"object"==typeof g||r.isFunction(g)||(g={}),h===i&&(g=this,h--);h<i;h++)if(null!=(a=arguments[h]))for(b in a)c=g[b],d=a[b],g!==d&&(j&&d&&(r.isPlainObject(d)||(e=Array.isArray(d)))?(e?(e=!1,f=c&&Array.isArray(c)?c:[]):f=c&&r.isPlainObject(c)?c:{},g[b]=r.extend(j,f,d)):void 0!==d&&(g[b]=d));return g},r.extend({expando:"jQuery"+(q+Math.random()).replace(/\D/g,""),isReady:!0,error:function(a){throw new Error(a)},noop:function(){},isFunction:function(a){return"function"===r.type(a)},isWindow:function(a){return null!=a&&a===a.window},isNumeric:function(a){var b=r.type(a);return("number"===b||"string"===b)&&!isNaN(a-parseFloat(a))},isPlainObject:function(a){var b,c;return!(!a||"[object Object]"!==k.call(a))&&(!(b=e(a))||(c=l.call(b,"constructor")&&b.constructor,"function"==typeof c&&m.call(c)===n))},isEmptyObject:function(a){var b;for(b in a)return!1;return!0},type:function(a){return null==a?a+"":"object"==typeof a||"function"==typeof a?j[k.call(a)]||"object":typeof a},globalEval:function(a){p(a)},camelCase:function(a){return a.replace(t,"ms-").replace(u,v)},each:function(a,b){var c,d=0;if(w(a)){for(c=a.length;d<c;d++)if(b.call(a[d],d,a[d])===!1)break}else for(d in a)if(b.call(a[d],d,a[d])===!1)break;return a},trim:function(a){return null==a?"":(a+"").replace(s,"")},makeArray:function(a,b){var c=b||[];return null!=a&&(w(Object(a))?r.merge(c,"string"==typeof a?[a]:a):h.call(c,a)),c},inArray:function(a,b,c){return null==b?-1:i.call(b,a,c)},merge:function(a,b){for(var c=+b.length,d=0,e=a.length;d<c;d++)a[e++]=b[d];return a.length=e,a},grep:function(a,b,c){for(var d,e=[],f=0,g=a.length,h=!c;f<g;f++)d=!b(a[f],f),d!==h&&e.push(a[f]);return e},map:function(a,b,c){var d,e,f=0,h=[];if(w(a))for(d=a.length;f<d;f++)e=b(a[f],f,c),null!=e&&h.push(e);else for(f in a)e=b(a[f],f,c),null!=e&&h.push(e);return g.apply([],h)},guid:1,proxy:function(a,b){var c,d,e;if("string"==typeof b&&(c=a[b],b=a,a=c),r.isFunction(a))return d=f.call(arguments,2),e=function(){return a.apply(b||this,d.concat(f.call(arguments)))},e.guid=a.guid=a.guid||r.guid++,e},now:Date.now,support:o}),"function"==typeof Symbol&&(r.fn[Symbol.iterator]=c[Symbol.iterator]),r.each("Boolean Number String Function Array Date RegExp Object Error Symbol".split(" "),function(a,b){j["[object "+b+"]"]=b.toLowerCase()});function w(a){var b=!!a&&"length"in a&&a.length,c=r.type(a);return"function"!==c&&!r.isWindow(a)&&("array"===c||0===b||"number"==typeof b&&b>0&&b-1 in a)}var x=function(a){var b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u="sizzle"+1*new Date,v=a.document,w=0,x=0,y=ha(),z=ha(),A=ha(),B=function(a,b){return a===b&&(l=!0),0},C={}.hasOwnProperty,D=[],E=D.pop,F=D.push,G=D.push,H=D.slice,I=function(a,b){for(var c=0,d=a.length;c<d;c++)if(a[c]===b)return c;return-1},J="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",K="[\\x20\\t\\r\\n\\f]",L="(?:\\\\.|[\\w-]|[^\0-\\xa0])+",M="\\["+K+"*("+L+")(?:"+K+"*([*^$|!~]?=)"+K+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+L+"))|)"+K+"*\\]",N=":("+L+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+M+")*)|.*)\\)|)",O=new RegExp(K+"+","g"),P=new RegExp("^"+K+"+|((?:^|[^\\\\])(?:\\\\.)*)"+K+"+$","g"),Q=new RegExp("^"+K+"*,"+K+"*"),R=new RegExp("^"+K+"*([>+~]|"+K+")"+K+"*"),S=new RegExp("="+K+"*([^\\]'\"]*?)"+K+"*\\]","g"),T=new RegExp(N),U=new RegExp("^"+L+"$"),V={ID:new RegExp("^#("+L+")"),CLASS:new RegExp("^\\.("+L+")"),TAG:new RegExp("^("+L+"|[*])"),ATTR:new RegExp("^"+M),PSEUDO:new RegExp("^"+N),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+K+"*(even|odd|(([+-]|)(\\d*)n|)"+K+"*(?:([+-]|)"+K+"*(\\d+)|))"+K+"*\\)|)","i"),bool:new RegExp("^(?:"+J+")$","i"),needsContext:new RegExp("^"+K+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+K+"*((?:-\\d)?\\d*)"+K+"*\\)|)(?=[^-]|$)","i")},W=/^(?:input|select|textarea|button)$/i,X=/^h\d$/i,Y=/^[^{]+\{\s*\[native \w/,Z=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,$=/[+~]/,_=new RegExp("\\\\([\\da-f]{1,6}"+K+"?|("+K+")|.)","ig"),aa=function(a,b,c){var d="0x"+b-65536;return d!==d||c?b:d<0?String.fromCharCode(d+65536):String.fromCharCode(d>>10|55296,1023&d|56320)},ba=/([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g,ca=function(a,b){return b?"\0"===a?"\ufffd":a.slice(0,-1)+"\\"+a.charCodeAt(a.length-1).toString(16)+" ":"\\"+a},da=function(){m()},ea=ta(function(a){return a.disabled===!0&&("form"in a||"label"in a)},{dir:"parentNode",next:"legend"});try{G.apply(D=H.call(v.childNodes),v.childNodes),D[v.childNodes.length].nodeType}catch(fa){G={apply:D.length?function(a,b){F.apply(a,H.call(b))}:function(a,b){var c=a.length,d=0;while(a[c++]=b[d++]);a.length=c-1}}}function ga(a,b,d,e){var f,h,j,k,l,o,r,s=b&&b.ownerDocument,w=b?b.nodeType:9;if(d=d||[],"string"!=typeof a||!a||1!==w&&9!==w&&11!==w)return d;if(!e&&((b?b.ownerDocument||b:v)!==n&&m(b),b=b||n,p)){if(11!==w&&(l=Z.exec(a)))if(f=l[1]){if(9===w){if(!(j=b.getElementById(f)))return d;if(j.id===f)return d.push(j),d}else if(s&&(j=s.getElementById(f))&&t(b,j)&&j.id===f)return d.push(j),d}else{if(l[2])return G.apply(d,b.getElementsByTagName(a)),d;if((f=l[3])&&c.getElementsByClassName&&b.getElementsByClassName)return G.apply(d,b.getElementsByClassName(f)),d}if(c.qsa&&!A[a+" "]&&(!q||!q.test(a))){if(1!==w)s=b,r=a;else if("object"!==b.nodeName.toLowerCase()){(k=b.getAttribute("id"))?k=k.replace(ba,ca):b.setAttribute("id",k=u),o=g(a),h=o.length;while(h--)o[h]="#"+k+" "+sa(o[h]);r=o.join(","),s=$.test(a)&&qa(b.parentNode)||b}if(r)try{return G.apply(d,s.querySelectorAll(r)),d}catch(x){}finally{k===u&&b.removeAttribute("id")}}}return i(a.replace(P,"$1"),b,d,e)}function ha(){var a=[];function b(c,e){return a.push(c+" ")>d.cacheLength&&delete b[a.shift()],b[c+" "]=e}return b}function ia(a){return a[u]=!0,a}function ja(a){var b=n.createElement("fieldset");try{return!!a(b)}catch(c){return!1}finally{b.parentNode&&b.parentNode.removeChild(b),b=null}}function ka(a,b){var c=a.split("|"),e=c.length;while(e--)d.attrHandle[c[e]]=b}function la(a,b){var c=b&&a,d=c&&1===a.nodeType&&1===b.nodeType&&a.sourceIndex-b.sourceIndex;if(d)return d;if(c)while(c=c.nextSibling)if(c===b)return-1;return a?1:-1}function ma(a){return function(b){var c=b.nodeName.toLowerCase();return"input"===c&&b.type===a}}function na(a){return function(b){var c=b.nodeName.toLowerCase();return("input"===c||"button"===c)&&b.type===a}}function oa(a){return function(b){return"form"in b?b.parentNode&&b.disabled===!1?"label"in b?"label"in b.parentNode?b.parentNode.disabled===a:b.disabled===a:b.isDisabled===a||b.isDisabled!==!a&&ea(b)===a:b.disabled===a:"label"in b&&b.disabled===a}}function pa(a){return ia(function(b){return b=+b,ia(function(c,d){var e,f=a([],c.length,b),g=f.length;while(g--)c[e=f[g]]&&(c[e]=!(d[e]=c[e]))})})}function qa(a){return a&&"undefined"!=typeof a.getElementsByTagName&&a}c=ga.support={},f=ga.isXML=function(a){var b=a&&(a.ownerDocument||a).documentElement;return!!b&&"HTML"!==b.nodeName},m=ga.setDocument=function(a){var b,e,g=a?a.ownerDocument||a:v;return g!==n&&9===g.nodeType&&g.documentElement?(n=g,o=n.documentElement,p=!f(n),v!==n&&(e=n.defaultView)&&e.top!==e&&(e.addEventListener?e.addEventListener("unload",da,!1):e.attachEvent&&e.attachEvent("onunload",da)),c.attributes=ja(function(a){return a.className="i",!a.getAttribute("className")}),c.getElementsByTagName=ja(function(a){return a.appendChild(n.createComment("")),!a.getElementsByTagName("*").length}),c.getElementsByClassName=Y.test(n.getElementsByClassName),c.getById=ja(function(a){return o.appendChild(a).id=u,!n.getElementsByName||!n.getElementsByName(u).length}),c.getById?(d.filter.ID=function(a){var b=a.replace(_,aa);return function(a){return a.getAttribute("id")===b}},d.find.ID=function(a,b){if("undefined"!=typeof b.getElementById&&p){var c=b.getElementById(a);return c?[c]:[]}}):(d.filter.ID=function(a){var b=a.replace(_,aa);return function(a){var c="undefined"!=typeof a.getAttributeNode&&a.getAttributeNode("id");return c&&c.value===b}},d.find.ID=function(a,b){if("undefined"!=typeof b.getElementById&&p){var c,d,e,f=b.getElementById(a);if(f){if(c=f.getAttributeNode("id"),c&&c.value===a)return[f];e=b.getElementsByName(a),d=0;while(f=e[d++])if(c=f.getAttributeNode("id"),c&&c.value===a)return[f]}return[]}}),d.find.TAG=c.getElementsByTagName?function(a,b){return"undefined"!=typeof b.getElementsByTagName?b.getElementsByTagName(a):c.qsa?b.querySelectorAll(a):void 0}:function(a,b){var c,d=[],e=0,f=b.getElementsByTagName(a);if("*"===a){while(c=f[e++])1===c.nodeType&&d.push(c);return d}return f},d.find.CLASS=c.getElementsByClassName&&function(a,b){if("undefined"!=typeof b.getElementsByClassName&&p)return b.getElementsByClassName(a)},r=[],q=[],(c.qsa=Y.test(n.querySelectorAll))&&(ja(function(a){o.appendChild(a).innerHTML="<a id='"+u+"'></a><select id='"+u+"-\r\\' msallowcapture=''><option selected=''></option></select>",a.querySelectorAll("[msallowcapture^='']").length&&q.push("[*^$]="+K+"*(?:''|\"\")"),a.querySelectorAll("[selected]").length||q.push("\\["+K+"*(?:value|"+J+")"),a.querySelectorAll("[id~="+u+"-]").length||q.push("~="),a.querySelectorAll(":checked").length||q.push(":checked"),a.querySelectorAll("a#"+u+"+*").length||q.push(".#.+[+~]")}),ja(function(a){a.innerHTML="<a href='' disabled='disabled'></a><select disabled='disabled'><option/></select>";var b=n.createElement("input");b.setAttribute("type","hidden"),a.appendChild(b).setAttribute("name","D"),a.querySelectorAll("[name=d]").length&&q.push("name"+K+"*[*^$|!~]?="),2!==a.querySelectorAll(":enabled").length&&q.push(":enabled",":disabled"),o.appendChild(a).disabled=!0,2!==a.querySelectorAll(":disabled").length&&q.push(":enabled",":disabled"),a.querySelectorAll("*,:x"),q.push(",.*:")})),(c.matchesSelector=Y.test(s=o.matches||o.webkitMatchesSelector||o.mozMatchesSelector||o.oMatchesSelector||o.msMatchesSelector))&&ja(function(a){c.disconnectedMatch=s.call(a,"*"),s.call(a,"[s!='']:x"),r.push("!=",N)}),q=q.length&&new RegExp(q.join("|")),r=r.length&&new RegExp(r.join("|")),b=Y.test(o.compareDocumentPosition),t=b||Y.test(o.contains)?function(a,b){var c=9===a.nodeType?a.documentElement:a,d=b&&b.parentNode;return a===d||!(!d||1!==d.nodeType||!(c.contains?c.contains(d):a.compareDocumentPosition&&16&a.compareDocumentPosition(d)))}:function(a,b){if(b)while(b=b.parentNode)if(b===a)return!0;return!1},B=b?function(a,b){if(a===b)return l=!0,0;var d=!a.compareDocumentPosition-!b.compareDocumentPosition;return d?d:(d=(a.ownerDocument||a)===(b.ownerDocument||b)?a.compareDocumentPosition(b):1,1&d||!c.sortDetached&&b.compareDocumentPosition(a)===d?a===n||a.ownerDocument===v&&t(v,a)?-1:b===n||b.ownerDocument===v&&t(v,b)?1:k?I(k,a)-I(k,b):0:4&d?-1:1)}:function(a,b){if(a===b)return l=!0,0;var c,d=0,e=a.parentNode,f=b.parentNode,g=[a],h=[b];if(!e||!f)return a===n?-1:b===n?1:e?-1:f?1:k?I(k,a)-I(k,b):0;if(e===f)return la(a,b);c=a;while(c=c.parentNode)g.unshift(c);c=b;while(c=c.parentNode)h.unshift(c);while(g[d]===h[d])d++;return d?la(g[d],h[d]):g[d]===v?-1:h[d]===v?1:0},n):n},ga.matches=function(a,b){return ga(a,null,null,b)},ga.matchesSelector=function(a,b){if((a.ownerDocument||a)!==n&&m(a),b=b.replace(S,"='$1']"),c.matchesSelector&&p&&!A[b+" "]&&(!r||!r.test(b))&&(!q||!q.test(b)))try{var d=s.call(a,b);if(d||c.disconnectedMatch||a.document&&11!==a.document.nodeType)return d}catch(e){}return ga(b,n,null,[a]).length>0},ga.contains=function(a,b){return(a.ownerDocument||a)!==n&&m(a),t(a,b)},ga.attr=function(a,b){(a.ownerDocument||a)!==n&&m(a);var e=d.attrHandle[b.toLowerCase()],f=e&&C.call(d.attrHandle,b.toLowerCase())?e(a,b,!p):void 0;return void 0!==f?f:c.attributes||!p?a.getAttribute(b):(f=a.getAttributeNode(b))&&f.specified?f.value:null},ga.escape=function(a){return(a+"").replace(ba,ca)},ga.error=function(a){throw new Error("Syntax error, unrecognized expression: "+a)},ga.uniqueSort=function(a){var b,d=[],e=0,f=0;if(l=!c.detectDuplicates,k=!c.sortStable&&a.slice(0),a.sort(B),l){while(b=a[f++])b===a[f]&&(e=d.push(f));while(e--)a.splice(d[e],1)}return k=null,a},e=ga.getText=function(a){var b,c="",d=0,f=a.nodeType;if(f){if(1===f||9===f||11===f){if("string"==typeof a.textContent)return a.textContent;for(a=a.firstChild;a;a=a.nextSibling)c+=e(a)}else if(3===f||4===f)return a.nodeValue}else while(b=a[d++])c+=e(b);return c},d=ga.selectors={cacheLength:50,createPseudo:ia,match:V,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(a){return a[1]=a[1].replace(_,aa),a[3]=(a[3]||a[4]||a[5]||"").replace(_,aa),"~="===a[2]&&(a[3]=" "+a[3]+" "),a.slice(0,4)},CHILD:function(a){return a[1]=a[1].toLowerCase(),"nth"===a[1].slice(0,3)?(a[3]||ga.error(a[0]),a[4]=+(a[4]?a[5]+(a[6]||1):2*("even"===a[3]||"odd"===a[3])),a[5]=+(a[7]+a[8]||"odd"===a[3])):a[3]&&ga.error(a[0]),a},PSEUDO:function(a){var b,c=!a[6]&&a[2];return V.CHILD.test(a[0])?null:(a[3]?a[2]=a[4]||a[5]||"":c&&T.test(c)&&(b=g(c,!0))&&(b=c.indexOf(")",c.length-b)-c.length)&&(a[0]=a[0].slice(0,b),a[2]=c.slice(0,b)),a.slice(0,3))}},filter:{TAG:function(a){var b=a.replace(_,aa).toLowerCase();return"*"===a?function(){return!0}:function(a){return a.nodeName&&a.nodeName.toLowerCase()===b}},CLASS:function(a){var b=y[a+" "];return b||(b=new RegExp("(^|"+K+")"+a+"("+K+"|$)"))&&y(a,function(a){return b.test("string"==typeof a.className&&a.className||"undefined"!=typeof a.getAttribute&&a.getAttribute("class")||"")})},ATTR:function(a,b,c){return function(d){var e=ga.attr(d,a);return null==e?"!="===b:!b||(e+="","="===b?e===c:"!="===b?e!==c:"^="===b?c&&0===e.indexOf(c):"*="===b?c&&e.indexOf(c)>-1:"$="===b?c&&e.slice(-c.length)===c:"~="===b?(" "+e.replace(O," ")+" ").indexOf(c)>-1:"|="===b&&(e===c||e.slice(0,c.length+1)===c+"-"))}},CHILD:function(a,b,c,d,e){var f="nth"!==a.slice(0,3),g="last"!==a.slice(-4),h="of-type"===b;return 1===d&&0===e?function(a){return!!a.parentNode}:function(b,c,i){var j,k,l,m,n,o,p=f!==g?"nextSibling":"previousSibling",q=b.parentNode,r=h&&b.nodeName.toLowerCase(),s=!i&&!h,t=!1;if(q){if(f){while(p){m=b;while(m=m[p])if(h?m.nodeName.toLowerCase()===r:1===m.nodeType)return!1;o=p="only"===a&&!o&&"nextSibling"}return!0}if(o=[g?q.firstChild:q.lastChild],g&&s){m=q,l=m[u]||(m[u]={}),k=l[m.uniqueID]||(l[m.uniqueID]={}),j=k[a]||[],n=j[0]===w&&j[1],t=n&&j[2],m=n&&q.childNodes[n];while(m=++n&&m&&m[p]||(t=n=0)||o.pop())if(1===m.nodeType&&++t&&m===b){k[a]=[w,n,t];break}}else if(s&&(m=b,l=m[u]||(m[u]={}),k=l[m.uniqueID]||(l[m.uniqueID]={}),j=k[a]||[],n=j[0]===w&&j[1],t=n),t===!1)while(m=++n&&m&&m[p]||(t=n=0)||o.pop())if((h?m.nodeName.toLowerCase()===r:1===m.nodeType)&&++t&&(s&&(l=m[u]||(m[u]={}),k=l[m.uniqueID]||(l[m.uniqueID]={}),k[a]=[w,t]),m===b))break;return t-=e,t===d||t%d===0&&t/d>=0}}},PSEUDO:function(a,b){var c,e=d.pseudos[a]||d.setFilters[a.toLowerCase()]||ga.error("unsupported pseudo: "+a);return e[u]?e(b):e.length>1?(c=[a,a,"",b],d.setFilters.hasOwnProperty(a.toLowerCase())?ia(function(a,c){var d,f=e(a,b),g=f.length;while(g--)d=I(a,f[g]),a[d]=!(c[d]=f[g])}):function(a){return e(a,0,c)}):e}},pseudos:{not:ia(function(a){var b=[],c=[],d=h(a.replace(P,"$1"));return d[u]?ia(function(a,b,c,e){var f,g=d(a,null,e,[]),h=a.length;while(h--)(f=g[h])&&(a[h]=!(b[h]=f))}):function(a,e,f){return b[0]=a,d(b,null,f,c),b[0]=null,!c.pop()}}),has:ia(function(a){return function(b){return ga(a,b).length>0}}),contains:ia(function(a){return a=a.replace(_,aa),function(b){return(b.textContent||b.innerText||e(b)).indexOf(a)>-1}}),lang:ia(function(a){return U.test(a||"")||ga.error("unsupported lang: "+a),a=a.replace(_,aa).toLowerCase(),function(b){var c;do if(c=p?b.lang:b.getAttribute("xml:lang")||b.getAttribute("lang"))return c=c.toLowerCase(),c===a||0===c.indexOf(a+"-");while((b=b.parentNode)&&1===b.nodeType);return!1}}),target:function(b){var c=a.location&&a.location.hash;return c&&c.slice(1)===b.id},root:function(a){return a===o},focus:function(a){return a===n.activeElement&&(!n.hasFocus||n.hasFocus())&&!!(a.type||a.href||~a.tabIndex)},enabled:oa(!1),disabled:oa(!0),checked:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&!!a.checked||"option"===b&&!!a.selected},selected:function(a){return a.parentNode&&a.parentNode.selectedIndex,a.selected===!0},empty:function(a){for(a=a.firstChild;a;a=a.nextSibling)if(a.nodeType<6)return!1;return!0},parent:function(a){return!d.pseudos.empty(a)},header:function(a){return X.test(a.nodeName)},input:function(a){return W.test(a.nodeName)},button:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&"button"===a.type||"button"===b},text:function(a){var b;return"input"===a.nodeName.toLowerCase()&&"text"===a.type&&(null==(b=a.getAttribute("type"))||"text"===b.toLowerCase())},first:pa(function(){return[0]}),last:pa(function(a,b){return[b-1]}),eq:pa(function(a,b,c){return[c<0?c+b:c]}),even:pa(function(a,b){for(var c=0;c<b;c+=2)a.push(c);return a}),odd:pa(function(a,b){for(var c=1;c<b;c+=2)a.push(c);return a}),lt:pa(function(a,b,c){for(var d=c<0?c+b:c;--d>=0;)a.push(d);return a}),gt:pa(function(a,b,c){for(var d=c<0?c+b:c;++d<b;)a.push(d);return a})}},d.pseudos.nth=d.pseudos.eq;for(b in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})d.pseudos[b]=ma(b);for(b in{submit:!0,reset:!0})d.pseudos[b]=na(b);function ra(){}ra.prototype=d.filters=d.pseudos,d.setFilters=new ra,g=ga.tokenize=function(a,b){var c,e,f,g,h,i,j,k=z[a+" "];if(k)return b?0:k.slice(0);h=a,i=[],j=d.preFilter;while(h){c&&!(e=Q.exec(h))||(e&&(h=h.slice(e[0].length)||h),i.push(f=[])),c=!1,(e=R.exec(h))&&(c=e.shift(),f.push({value:c,type:e[0].replace(P," ")}),h=h.slice(c.length));for(g in d.filter)!(e=V[g].exec(h))||j[g]&&!(e=j[g](e))||(c=e.shift(),f.push({value:c,type:g,matches:e}),h=h.slice(c.length));if(!c)break}return b?h.length:h?ga.error(a):z(a,i).slice(0)};function sa(a){for(var b=0,c=a.length,d="";b<c;b++)d+=a[b].value;return d}function ta(a,b,c){var d=b.dir,e=b.next,f=e||d,g=c&&"parentNode"===f,h=x++;return b.first?function(b,c,e){while(b=b[d])if(1===b.nodeType||g)return a(b,c,e);return!1}:function(b,c,i){var j,k,l,m=[w,h];if(i){while(b=b[d])if((1===b.nodeType||g)&&a(b,c,i))return!0}else while(b=b[d])if(1===b.nodeType||g)if(l=b[u]||(b[u]={}),k=l[b.uniqueID]||(l[b.uniqueID]={}),e&&e===b.nodeName.toLowerCase())b=b[d]||b;else{if((j=k[f])&&j[0]===w&&j[1]===h)return m[2]=j[2];if(k[f]=m,m[2]=a(b,c,i))return!0}return!1}}function ua(a){return a.length>1?function(b,c,d){var e=a.length;while(e--)if(!a[e](b,c,d))return!1;return!0}:a[0]}function va(a,b,c){for(var d=0,e=b.length;d<e;d++)ga(a,b[d],c);return c}function wa(a,b,c,d,e){for(var f,g=[],h=0,i=a.length,j=null!=b;h<i;h++)(f=a[h])&&(c&&!c(f,d,e)||(g.push(f),j&&b.push(h)));return g}function xa(a,b,c,d,e,f){return d&&!d[u]&&(d=xa(d)),e&&!e[u]&&(e=xa(e,f)),ia(function(f,g,h,i){var j,k,l,m=[],n=[],o=g.length,p=f||va(b||"*",h.nodeType?[h]:h,[]),q=!a||!f&&b?p:wa(p,m,a,h,i),r=c?e||(f?a:o||d)?[]:g:q;if(c&&c(q,r,h,i),d){j=wa(r,n),d(j,[],h,i),k=j.length;while(k--)(l=j[k])&&(r[n[k]]=!(q[n[k]]=l))}if(f){if(e||a){if(e){j=[],k=r.length;while(k--)(l=r[k])&&j.push(q[k]=l);e(null,r=[],j,i)}k=r.length;while(k--)(l=r[k])&&(j=e?I(f,l):m[k])>-1&&(f[j]=!(g[j]=l))}}else r=wa(r===g?r.splice(o,r.length):r),e?e(null,g,r,i):G.apply(g,r)})}function ya(a){for(var b,c,e,f=a.length,g=d.relative[a[0].type],h=g||d.relative[" "],i=g?1:0,k=ta(function(a){return a===b},h,!0),l=ta(function(a){return I(b,a)>-1},h,!0),m=[function(a,c,d){var e=!g&&(d||c!==j)||((b=c).nodeType?k(a,c,d):l(a,c,d));return b=null,e}];i<f;i++)if(c=d.relative[a[i].type])m=[ta(ua(m),c)];else{if(c=d.filter[a[i].type].apply(null,a[i].matches),c[u]){for(e=++i;e<f;e++)if(d.relative[a[e].type])break;return xa(i>1&&ua(m),i>1&&sa(a.slice(0,i-1).concat({value:" "===a[i-2].type?"*":""})).replace(P,"$1"),c,i<e&&ya(a.slice(i,e)),e<f&&ya(a=a.slice(e)),e<f&&sa(a))}m.push(c)}return ua(m)}function za(a,b){var c=b.length>0,e=a.length>0,f=function(f,g,h,i,k){var l,o,q,r=0,s="0",t=f&&[],u=[],v=j,x=f||e&&d.find.TAG("*",k),y=w+=null==v?1:Math.random()||.1,z=x.length;for(k&&(j=g===n||g||k);s!==z&&null!=(l=x[s]);s++){if(e&&l){o=0,g||l.ownerDocument===n||(m(l),h=!p);while(q=a[o++])if(q(l,g||n,h)){i.push(l);break}k&&(w=y)}c&&((l=!q&&l)&&r--,f&&t.push(l))}if(r+=s,c&&s!==r){o=0;while(q=b[o++])q(t,u,g,h);if(f){if(r>0)while(s--)t[s]||u[s]||(u[s]=E.call(i));u=wa(u)}G.apply(i,u),k&&!f&&u.length>0&&r+b.length>1&&ga.uniqueSort(i)}return k&&(w=y,j=v),t};return c?ia(f):f}return h=ga.compile=function(a,b){var c,d=[],e=[],f=A[a+" "];if(!f){b||(b=g(a)),c=b.length;while(c--)f=ya(b[c]),f[u]?d.push(f):e.push(f);f=A(a,za(e,d)),f.selector=a}return f},i=ga.select=function(a,b,c,e){var f,i,j,k,l,m="function"==typeof a&&a,n=!e&&g(a=m.selector||a);if(c=c||[],1===n.length){if(i=n[0]=n[0].slice(0),i.length>2&&"ID"===(j=i[0]).type&&9===b.nodeType&&p&&d.relative[i[1].type]){if(b=(d.find.ID(j.matches[0].replace(_,aa),b)||[])[0],!b)return c;m&&(b=b.parentNode),a=a.slice(i.shift().value.length)}f=V.needsContext.test(a)?0:i.length;while(f--){if(j=i[f],d.relative[k=j.type])break;if((l=d.find[k])&&(e=l(j.matches[0].replace(_,aa),$.test(i[0].type)&&qa(b.parentNode)||b))){if(i.splice(f,1),a=e.length&&sa(i),!a)return G.apply(c,e),c;break}}}return(m||h(a,n))(e,b,!p,c,!b||$.test(a)&&qa(b.parentNode)||b),c},c.sortStable=u.split("").sort(B).join("")===u,c.detectDuplicates=!!l,m(),c.sortDetached=ja(function(a){return 1&a.compareDocumentPosition(n.createElement("fieldset"))}),ja(function(a){return a.innerHTML="<a href='#'></a>","#"===a.firstChild.getAttribute("href")})||ka("type|href|height|width",function(a,b,c){if(!c)return a.getAttribute(b,"type"===b.toLowerCase()?1:2)}),c.attributes&&ja(function(a){return a.innerHTML="<input/>",a.firstChild.setAttribute("value",""),""===a.firstChild.getAttribute("value")})||ka("value",function(a,b,c){if(!c&&"input"===a.nodeName.toLowerCase())return a.defaultValue}),ja(function(a){return null==a.getAttribute("disabled")})||ka(J,function(a,b,c){var d;if(!c)return a[b]===!0?b.toLowerCase():(d=a.getAttributeNode(b))&&d.specified?d.value:null}),ga}(a);r.find=x,r.expr=x.selectors,r.expr[":"]=r.expr.pseudos,r.uniqueSort=r.unique=x.uniqueSort,r.text=x.getText,r.isXMLDoc=x.isXML,r.contains=x.contains,r.escapeSelector=x.escape;var y=function(a,b,c){var d=[],e=void 0!==c;while((a=a[b])&&9!==a.nodeType)if(1===a.nodeType){if(e&&r(a).is(c))break;d.push(a)}return d},z=function(a,b){for(var c=[];a;a=a.nextSibling)1===a.nodeType&&a!==b&&c.push(a);return c},A=r.expr.match.needsContext;function B(a,b){return a.nodeName&&a.nodeName.toLowerCase()===b.toLowerCase()}var C=/^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i,D=/^.[^:#\[\.,]*$/;function E(a,b,c){return r.isFunction(b)?r.grep(a,function(a,d){return!!b.call(a,d,a)!==c}):b.nodeType?r.grep(a,function(a){return a===b!==c}):"string"!=typeof b?r.grep(a,function(a){return i.call(b,a)>-1!==c}):D.test(b)?r.filter(b,a,c):(b=r.filter(b,a),r.grep(a,function(a){return i.call(b,a)>-1!==c&&1===a.nodeType}))}r.filter=function(a,b,c){var d=b[0];return c&&(a=":not("+a+")"),1===b.length&&1===d.nodeType?r.find.matchesSelector(d,a)?[d]:[]:r.find.matches(a,r.grep(b,function(a){return 1===a.nodeType}))},r.fn.extend({find:function(a){var b,c,d=this.length,e=this;if("string"!=typeof a)return this.pushStack(r(a).filter(function(){for(b=0;b<d;b++)if(r.contains(e[b],this))return!0}));for(c=this.pushStack([]),b=0;b<d;b++)r.find(a,e[b],c);return d>1?r.uniqueSort(c):c},filter:function(a){return this.pushStack(E(this,a||[],!1))},not:function(a){return this.pushStack(E(this,a||[],!0))},is:function(a){return!!E(this,"string"==typeof a&&A.test(a)?r(a):a||[],!1).length}});var F,G=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/,H=r.fn.init=function(a,b,c){var e,f;if(!a)return this;if(c=c||F,"string"==typeof a){if(e="<"===a[0]&&">"===a[a.length-1]&&a.length>=3?[null,a,null]:G.exec(a),!e||!e[1]&&b)return!b||b.jquery?(b||c).find(a):this.constructor(b).find(a);if(e[1]){if(b=b instanceof r?b[0]:b,r.merge(this,r.parseHTML(e[1],b&&b.nodeType?b.ownerDocument||b:d,!0)),C.test(e[1])&&r.isPlainObject(b))for(e in b)r.isFunction(this[e])?this[e](b[e]):this.attr(e,b[e]);return this}return f=d.getElementById(e[2]),f&&(this[0]=f,this.length=1),this}return a.nodeType?(this[0]=a,this.length=1,this):r.isFunction(a)?void 0!==c.ready?c.ready(a):a(r):r.makeArray(a,this)};H.prototype=r.fn,F=r(d);var I=/^(?:parents|prev(?:Until|All))/,J={children:!0,contents:!0,next:!0,prev:!0};r.fn.extend({has:function(a){var b=r(a,this),c=b.length;return this.filter(function(){for(var a=0;a<c;a++)if(r.contains(this,b[a]))return!0})},closest:function(a,b){var c,d=0,e=this.length,f=[],g="string"!=typeof a&&r(a);if(!A.test(a))for(;d<e;d++)for(c=this[d];c&&c!==b;c=c.parentNode)if(c.nodeType<11&&(g?g.index(c)>-1:1===c.nodeType&&r.find.matchesSelector(c,a))){f.push(c);break}return this.pushStack(f.length>1?r.uniqueSort(f):f)},index:function(a){return a?"string"==typeof a?i.call(r(a),this[0]):i.call(this,a.jquery?a[0]:a):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(a,b){return this.pushStack(r.uniqueSort(r.merge(this.get(),r(a,b))))},addBack:function(a){return this.add(null==a?this.prevObject:this.prevObject.filter(a))}});function K(a,b){while((a=a[b])&&1!==a.nodeType);return a}r.each({parent:function(a){var b=a.parentNode;return b&&11!==b.nodeType?b:null},parents:function(a){return y(a,"parentNode")},parentsUntil:function(a,b,c){return y(a,"parentNode",c)},next:function(a){return K(a,"nextSibling")},prev:function(a){return K(a,"previousSibling")},nextAll:function(a){return y(a,"nextSibling")},prevAll:function(a){return y(a,"previousSibling")},nextUntil:function(a,b,c){return y(a,"nextSibling",c)},prevUntil:function(a,b,c){return y(a,"previousSibling",c)},siblings:function(a){return z((a.parentNode||{}).firstChild,a)},children:function(a){return z(a.firstChild)},contents:function(a){return B(a,"iframe")?a.contentDocument:(B(a,"template")&&(a=a.content||a),r.merge([],a.childNodes))}},function(a,b){r.fn[a]=function(c,d){var e=r.map(this,b,c);return"Until"!==a.slice(-5)&&(d=c),d&&"string"==typeof d&&(e=r.filter(d,e)),this.length>1&&(J[a]||r.uniqueSort(e),I.test(a)&&e.reverse()),this.pushStack(e)}});var L=/[^\x20\t\r\n\f]+/g;function M(a){var b={};return r.each(a.match(L)||[],function(a,c){b[c]=!0}),b}r.Callbacks=function(a){a="string"==typeof a?M(a):r.extend({},a);var b,c,d,e,f=[],g=[],h=-1,i=function(){for(e=e||a.once,d=b=!0;g.length;h=-1){c=g.shift();while(++h<f.length)f[h].apply(c[0],c[1])===!1&&a.stopOnFalse&&(h=f.length,c=!1)}a.memory||(c=!1),b=!1,e&&(f=c?[]:"")},j={add:function(){return f&&(c&&!b&&(h=f.length-1,g.push(c)),function d(b){r.each(b,function(b,c){r.isFunction(c)?a.unique&&j.has(c)||f.push(c):c&&c.length&&"string"!==r.type(c)&&d(c)})}(arguments),c&&!b&&i()),this},remove:function(){return r.each(arguments,function(a,b){var c;while((c=r.inArray(b,f,c))>-1)f.splice(c,1),c<=h&&h--}),this},has:function(a){return a?r.inArray(a,f)>-1:f.length>0},empty:function(){return f&&(f=[]),this},disable:function(){return e=g=[],f=c="",this},disabled:function(){return!f},lock:function(){return e=g=[],c||b||(f=c=""),this},locked:function(){return!!e},fireWith:function(a,c){return e||(c=c||[],c=[a,c.slice?c.slice():c],g.push(c),b||i()),this},fire:function(){return j.fireWith(this,arguments),this},fired:function(){return!!d}};return j};function N(a){return a}function O(a){throw a}function P(a,b,c,d){var e;try{a&&r.isFunction(e=a.promise)?e.call(a).done(b).fail(c):a&&r.isFunction(e=a.then)?e.call(a,b,c):b.apply(void 0,[a].slice(d))}catch(a){c.apply(void 0,[a])}}r.extend({Deferred:function(b){var c=[["notify","progress",r.Callbacks("memory"),r.Callbacks("memory"),2],["resolve","done",r.Callbacks("once memory"),r.Callbacks("once memory"),0,"resolved"],["reject","fail",r.Callbacks("once memory"),r.Callbacks("once memory"),1,"rejected"]],d="pending",e={state:function(){return d},always:function(){return f.done(arguments).fail(arguments),this},"catch":function(a){return e.then(null,a)},pipe:function(){var a=arguments;return r.Deferred(function(b){r.each(c,function(c,d){var e=r.isFunction(a[d[4]])&&a[d[4]];f[d[1]](function(){var a=e&&e.apply(this,arguments);a&&r.isFunction(a.promise)?a.promise().progress(b.notify).done(b.resolve).fail(b.reject):b[d[0]+"With"](this,e?[a]:arguments)})}),a=null}).promise()},then:function(b,d,e){var f=0;function g(b,c,d,e){return function(){var h=this,i=arguments,j=function(){var a,j;if(!(b<f)){if(a=d.apply(h,i),a===c.promise())throw new TypeError("Thenable self-resolution");j=a&&("object"==typeof a||"function"==typeof a)&&a.then,r.isFunction(j)?e?j.call(a,g(f,c,N,e),g(f,c,O,e)):(f++,j.call(a,g(f,c,N,e),g(f,c,O,e),g(f,c,N,c.notifyWith))):(d!==N&&(h=void 0,i=[a]),(e||c.resolveWith)(h,i))}},k=e?j:function(){try{j()}catch(a){r.Deferred.exceptionHook&&r.Deferred.exceptionHook(a,k.stackTrace),b+1>=f&&(d!==O&&(h=void 0,i=[a]),c.rejectWith(h,i))}};b?k():(r.Deferred.getStackHook&&(k.stackTrace=r.Deferred.getStackHook()),a.setTimeout(k))}}return r.Deferred(function(a){c[0][3].add(g(0,a,r.isFunction(e)?e:N,a.notifyWith)),c[1][3].add(g(0,a,r.isFunction(b)?b:N)),c[2][3].add(g(0,a,r.isFunction(d)?d:O))}).promise()},promise:function(a){return null!=a?r.extend(a,e):e}},f={};return r.each(c,function(a,b){var g=b[2],h=b[5];e[b[1]]=g.add,h&&g.add(function(){d=h},c[3-a][2].disable,c[0][2].lock),g.add(b[3].fire),f[b[0]]=function(){return f[b[0]+"With"](this===f?void 0:this,arguments),this},f[b[0]+"With"]=g.fireWith}),e.promise(f),b&&b.call(f,f),f},when:function(a){var b=arguments.length,c=b,d=Array(c),e=f.call(arguments),g=r.Deferred(),h=function(a){return function(c){d[a]=this,e[a]=arguments.length>1?f.call(arguments):c,--b||g.resolveWith(d,e)}};if(b<=1&&(P(a,g.done(h(c)).resolve,g.reject,!b),"pending"===g.state()||r.isFunction(e[c]&&e[c].then)))return g.then();while(c--)P(e[c],h(c),g.reject);return g.promise()}});var Q=/^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;r.Deferred.exceptionHook=function(b,c){a.console&&a.console.warn&&b&&Q.test(b.name)&&a.console.warn("jQuery.Deferred exception: "+b.message,b.stack,c)},r.readyException=function(b){a.setTimeout(function(){throw b})};var R=r.Deferred();r.fn.ready=function(a){return R.then(a)["catch"](function(a){r.readyException(a)}),this},r.extend({isReady:!1,readyWait:1,ready:function(a){(a===!0?--r.readyWait:r.isReady)||(r.isReady=!0,a!==!0&&--r.readyWait>0||R.resolveWith(d,[r]))}}),r.ready.then=R.then;function S(){d.removeEventListener("DOMContentLoaded",S),
a.removeEventListener("load",S),r.ready()}"complete"===d.readyState||"loading"!==d.readyState&&!d.documentElement.doScroll?a.setTimeout(r.ready):(d.addEventListener("DOMContentLoaded",S),a.addEventListener("load",S));var T=function(a,b,c,d,e,f,g){var h=0,i=a.length,j=null==c;if("object"===r.type(c)){e=!0;for(h in c)T(a,b,h,c[h],!0,f,g)}else if(void 0!==d&&(e=!0,r.isFunction(d)||(g=!0),j&&(g?(b.call(a,d),b=null):(j=b,b=function(a,b,c){return j.call(r(a),c)})),b))for(;h<i;h++)b(a[h],c,g?d:d.call(a[h],h,b(a[h],c)));return e?a:j?b.call(a):i?b(a[0],c):f},U=function(a){return 1===a.nodeType||9===a.nodeType||!+a.nodeType};function V(){this.expando=r.expando+V.uid++}V.uid=1,V.prototype={cache:function(a){var b=a[this.expando];return b||(b={},U(a)&&(a.nodeType?a[this.expando]=b:Object.defineProperty(a,this.expando,{value:b,configurable:!0}))),b},set:function(a,b,c){var d,e=this.cache(a);if("string"==typeof b)e[r.camelCase(b)]=c;else for(d in b)e[r.camelCase(d)]=b[d];return e},get:function(a,b){return void 0===b?this.cache(a):a[this.expando]&&a[this.expando][r.camelCase(b)]},access:function(a,b,c){return void 0===b||b&&"string"==typeof b&&void 0===c?this.get(a,b):(this.set(a,b,c),void 0!==c?c:b)},remove:function(a,b){var c,d=a[this.expando];if(void 0!==d){if(void 0!==b){Array.isArray(b)?b=b.map(r.camelCase):(b=r.camelCase(b),b=b in d?[b]:b.match(L)||[]),c=b.length;while(c--)delete d[b[c]]}(void 0===b||r.isEmptyObject(d))&&(a.nodeType?a[this.expando]=void 0:delete a[this.expando])}},hasData:function(a){var b=a[this.expando];return void 0!==b&&!r.isEmptyObject(b)}};var W=new V,X=new V,Y=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,Z=/[A-Z]/g;function $(a){return"true"===a||"false"!==a&&("null"===a?null:a===+a+""?+a:Y.test(a)?JSON.parse(a):a)}function _(a,b,c){var d;if(void 0===c&&1===a.nodeType)if(d="data-"+b.replace(Z,"-$&").toLowerCase(),c=a.getAttribute(d),"string"==typeof c){try{c=$(c)}catch(e){}X.set(a,b,c)}else c=void 0;return c}r.extend({hasData:function(a){return X.hasData(a)||W.hasData(a)},data:function(a,b,c){return X.access(a,b,c)},removeData:function(a,b){X.remove(a,b)},_data:function(a,b,c){return W.access(a,b,c)},_removeData:function(a,b){W.remove(a,b)}}),r.fn.extend({data:function(a,b){var c,d,e,f=this[0],g=f&&f.attributes;if(void 0===a){if(this.length&&(e=X.get(f),1===f.nodeType&&!W.get(f,"hasDataAttrs"))){c=g.length;while(c--)g[c]&&(d=g[c].name,0===d.indexOf("data-")&&(d=r.camelCase(d.slice(5)),_(f,d,e[d])));W.set(f,"hasDataAttrs",!0)}return e}return"object"==typeof a?this.each(function(){X.set(this,a)}):T(this,function(b){var c;if(f&&void 0===b){if(c=X.get(f,a),void 0!==c)return c;if(c=_(f,a),void 0!==c)return c}else this.each(function(){X.set(this,a,b)})},null,b,arguments.length>1,null,!0)},removeData:function(a){return this.each(function(){X.remove(this,a)})}}),r.extend({queue:function(a,b,c){var d;if(a)return b=(b||"fx")+"queue",d=W.get(a,b),c&&(!d||Array.isArray(c)?d=W.access(a,b,r.makeArray(c)):d.push(c)),d||[]},dequeue:function(a,b){b=b||"fx";var c=r.queue(a,b),d=c.length,e=c.shift(),f=r._queueHooks(a,b),g=function(){r.dequeue(a,b)};"inprogress"===e&&(e=c.shift(),d--),e&&("fx"===b&&c.unshift("inprogress"),delete f.stop,e.call(a,g,f)),!d&&f&&f.empty.fire()},_queueHooks:function(a,b){var c=b+"queueHooks";return W.get(a,c)||W.access(a,c,{empty:r.Callbacks("once memory").add(function(){W.remove(a,[b+"queue",c])})})}}),r.fn.extend({queue:function(a,b){var c=2;return"string"!=typeof a&&(b=a,a="fx",c--),arguments.length<c?r.queue(this[0],a):void 0===b?this:this.each(function(){var c=r.queue(this,a,b);r._queueHooks(this,a),"fx"===a&&"inprogress"!==c[0]&&r.dequeue(this,a)})},dequeue:function(a){return this.each(function(){r.dequeue(this,a)})},clearQueue:function(a){return this.queue(a||"fx",[])},promise:function(a,b){var c,d=1,e=r.Deferred(),f=this,g=this.length,h=function(){--d||e.resolveWith(f,[f])};"string"!=typeof a&&(b=a,a=void 0),a=a||"fx";while(g--)c=W.get(f[g],a+"queueHooks"),c&&c.empty&&(d++,c.empty.add(h));return h(),e.promise(b)}});var aa=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,ba=new RegExp("^(?:([+-])=|)("+aa+")([a-z%]*)$","i"),ca=["Top","Right","Bottom","Left"],da=function(a,b){return a=b||a,"none"===a.style.display||""===a.style.display&&r.contains(a.ownerDocument,a)&&"none"===r.css(a,"display")},ea=function(a,b,c,d){var e,f,g={};for(f in b)g[f]=a.style[f],a.style[f]=b[f];e=c.apply(a,d||[]);for(f in b)a.style[f]=g[f];return e};function fa(a,b,c,d){var e,f=1,g=20,h=d?function(){return d.cur()}:function(){return r.css(a,b,"")},i=h(),j=c&&c[3]||(r.cssNumber[b]?"":"px"),k=(r.cssNumber[b]||"px"!==j&&+i)&&ba.exec(r.css(a,b));if(k&&k[3]!==j){j=j||k[3],c=c||[],k=+i||1;do f=f||".5",k/=f,r.style(a,b,k+j);while(f!==(f=h()/i)&&1!==f&&--g)}return c&&(k=+k||+i||0,e=c[1]?k+(c[1]+1)*c[2]:+c[2],d&&(d.unit=j,d.start=k,d.end=e)),e}var ga={};function ha(a){var b,c=a.ownerDocument,d=a.nodeName,e=ga[d];return e?e:(b=c.body.appendChild(c.createElement(d)),e=r.css(b,"display"),b.parentNode.removeChild(b),"none"===e&&(e="block"),ga[d]=e,e)}function ia(a,b){for(var c,d,e=[],f=0,g=a.length;f<g;f++)d=a[f],d.style&&(c=d.style.display,b?("none"===c&&(e[f]=W.get(d,"display")||null,e[f]||(d.style.display="")),""===d.style.display&&da(d)&&(e[f]=ha(d))):"none"!==c&&(e[f]="none",W.set(d,"display",c)));for(f=0;f<g;f++)null!=e[f]&&(a[f].style.display=e[f]);return a}r.fn.extend({show:function(){return ia(this,!0)},hide:function(){return ia(this)},toggle:function(a){return"boolean"==typeof a?a?this.show():this.hide():this.each(function(){da(this)?r(this).show():r(this).hide()})}});var ja=/^(?:checkbox|radio)$/i,ka=/<([a-z][^\/\0>\x20\t\r\n\f]+)/i,la=/^$|\/(?:java|ecma)script/i,ma={option:[1,"<select multiple='multiple'>","</select>"],thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};ma.optgroup=ma.option,ma.tbody=ma.tfoot=ma.colgroup=ma.caption=ma.thead,ma.th=ma.td;function na(a,b){var c;return c="undefined"!=typeof a.getElementsByTagName?a.getElementsByTagName(b||"*"):"undefined"!=typeof a.querySelectorAll?a.querySelectorAll(b||"*"):[],void 0===b||b&&B(a,b)?r.merge([a],c):c}function oa(a,b){for(var c=0,d=a.length;c<d;c++)W.set(a[c],"globalEval",!b||W.get(b[c],"globalEval"))}var pa=/<|&#?\w+;/;function qa(a,b,c,d,e){for(var f,g,h,i,j,k,l=b.createDocumentFragment(),m=[],n=0,o=a.length;n<o;n++)if(f=a[n],f||0===f)if("object"===r.type(f))r.merge(m,f.nodeType?[f]:f);else if(pa.test(f)){g=g||l.appendChild(b.createElement("div")),h=(ka.exec(f)||["",""])[1].toLowerCase(),i=ma[h]||ma._default,g.innerHTML=i[1]+r.htmlPrefilter(f)+i[2],k=i[0];while(k--)g=g.lastChild;r.merge(m,g.childNodes),g=l.firstChild,g.textContent=""}else m.push(b.createTextNode(f));l.textContent="",n=0;while(f=m[n++])if(d&&r.inArray(f,d)>-1)e&&e.push(f);else if(j=r.contains(f.ownerDocument,f),g=na(l.appendChild(f),"script"),j&&oa(g),c){k=0;while(f=g[k++])la.test(f.type||"")&&c.push(f)}return l}!function(){var a=d.createDocumentFragment(),b=a.appendChild(d.createElement("div")),c=d.createElement("input");c.setAttribute("type","radio"),c.setAttribute("checked","checked"),c.setAttribute("name","t"),b.appendChild(c),o.checkClone=b.cloneNode(!0).cloneNode(!0).lastChild.checked,b.innerHTML="<textarea>x</textarea>",o.noCloneChecked=!!b.cloneNode(!0).lastChild.defaultValue}();var ra=d.documentElement,sa=/^key/,ta=/^(?:mouse|pointer|contextmenu|drag|drop)|click/,ua=/^([^.]*)(?:\.(.+)|)/;function va(){return!0}function wa(){return!1}function xa(){try{return d.activeElement}catch(a){}}function ya(a,b,c,d,e,f){var g,h;if("object"==typeof b){"string"!=typeof c&&(d=d||c,c=void 0);for(h in b)ya(a,h,c,d,b[h],f);return a}if(null==d&&null==e?(e=c,d=c=void 0):null==e&&("string"==typeof c?(e=d,d=void 0):(e=d,d=c,c=void 0)),e===!1)e=wa;else if(!e)return a;return 1===f&&(g=e,e=function(a){return r().off(a),g.apply(this,arguments)},e.guid=g.guid||(g.guid=r.guid++)),a.each(function(){r.event.add(this,b,e,d,c)})}r.event={global:{},add:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,n,o,p,q=W.get(a);if(q){c.handler&&(f=c,c=f.handler,e=f.selector),e&&r.find.matchesSelector(ra,e),c.guid||(c.guid=r.guid++),(i=q.events)||(i=q.events={}),(g=q.handle)||(g=q.handle=function(b){return"undefined"!=typeof r&&r.event.triggered!==b.type?r.event.dispatch.apply(a,arguments):void 0}),b=(b||"").match(L)||[""],j=b.length;while(j--)h=ua.exec(b[j])||[],n=p=h[1],o=(h[2]||"").split(".").sort(),n&&(l=r.event.special[n]||{},n=(e?l.delegateType:l.bindType)||n,l=r.event.special[n]||{},k=r.extend({type:n,origType:p,data:d,handler:c,guid:c.guid,selector:e,needsContext:e&&r.expr.match.needsContext.test(e),namespace:o.join(".")},f),(m=i[n])||(m=i[n]=[],m.delegateCount=0,l.setup&&l.setup.call(a,d,o,g)!==!1||a.addEventListener&&a.addEventListener(n,g)),l.add&&(l.add.call(a,k),k.handler.guid||(k.handler.guid=c.guid)),e?m.splice(m.delegateCount++,0,k):m.push(k),r.event.global[n]=!0)}},remove:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,n,o,p,q=W.hasData(a)&&W.get(a);if(q&&(i=q.events)){b=(b||"").match(L)||[""],j=b.length;while(j--)if(h=ua.exec(b[j])||[],n=p=h[1],o=(h[2]||"").split(".").sort(),n){l=r.event.special[n]||{},n=(d?l.delegateType:l.bindType)||n,m=i[n]||[],h=h[2]&&new RegExp("(^|\\.)"+o.join("\\.(?:.*\\.|)")+"(\\.|$)"),g=f=m.length;while(f--)k=m[f],!e&&p!==k.origType||c&&c.guid!==k.guid||h&&!h.test(k.namespace)||d&&d!==k.selector&&("**"!==d||!k.selector)||(m.splice(f,1),k.selector&&m.delegateCount--,l.remove&&l.remove.call(a,k));g&&!m.length&&(l.teardown&&l.teardown.call(a,o,q.handle)!==!1||r.removeEvent(a,n,q.handle),delete i[n])}else for(n in i)r.event.remove(a,n+b[j],c,d,!0);r.isEmptyObject(i)&&W.remove(a,"handle events")}},dispatch:function(a){var b=r.event.fix(a),c,d,e,f,g,h,i=new Array(arguments.length),j=(W.get(this,"events")||{})[b.type]||[],k=r.event.special[b.type]||{};for(i[0]=b,c=1;c<arguments.length;c++)i[c]=arguments[c];if(b.delegateTarget=this,!k.preDispatch||k.preDispatch.call(this,b)!==!1){h=r.event.handlers.call(this,b,j),c=0;while((f=h[c++])&&!b.isPropagationStopped()){b.currentTarget=f.elem,d=0;while((g=f.handlers[d++])&&!b.isImmediatePropagationStopped())b.rnamespace&&!b.rnamespace.test(g.namespace)||(b.handleObj=g,b.data=g.data,e=((r.event.special[g.origType]||{}).handle||g.handler).apply(f.elem,i),void 0!==e&&(b.result=e)===!1&&(b.preventDefault(),b.stopPropagation()))}return k.postDispatch&&k.postDispatch.call(this,b),b.result}},handlers:function(a,b){var c,d,e,f,g,h=[],i=b.delegateCount,j=a.target;if(i&&j.nodeType&&!("click"===a.type&&a.button>=1))for(;j!==this;j=j.parentNode||this)if(1===j.nodeType&&("click"!==a.type||j.disabled!==!0)){for(f=[],g={},c=0;c<i;c++)d=b[c],e=d.selector+" ",void 0===g[e]&&(g[e]=d.needsContext?r(e,this).index(j)>-1:r.find(e,this,null,[j]).length),g[e]&&f.push(d);f.length&&h.push({elem:j,handlers:f})}return j=this,i<b.length&&h.push({elem:j,handlers:b.slice(i)}),h},addProp:function(a,b){Object.defineProperty(r.Event.prototype,a,{enumerable:!0,configurable:!0,get:r.isFunction(b)?function(){if(this.originalEvent)return b(this.originalEvent)}:function(){if(this.originalEvent)return this.originalEvent[a]},set:function(b){Object.defineProperty(this,a,{enumerable:!0,configurable:!0,writable:!0,value:b})}})},fix:function(a){return a[r.expando]?a:new r.Event(a)},special:{load:{noBubble:!0},focus:{trigger:function(){if(this!==xa()&&this.focus)return this.focus(),!1},delegateType:"focusin"},blur:{trigger:function(){if(this===xa()&&this.blur)return this.blur(),!1},delegateType:"focusout"},click:{trigger:function(){if("checkbox"===this.type&&this.click&&B(this,"input"))return this.click(),!1},_default:function(a){return B(a.target,"a")}},beforeunload:{postDispatch:function(a){void 0!==a.result&&a.originalEvent&&(a.originalEvent.returnValue=a.result)}}}},r.removeEvent=function(a,b,c){a.removeEventListener&&a.removeEventListener(b,c)},r.Event=function(a,b){return this instanceof r.Event?(a&&a.type?(this.originalEvent=a,this.type=a.type,this.isDefaultPrevented=a.defaultPrevented||void 0===a.defaultPrevented&&a.returnValue===!1?va:wa,this.target=a.target&&3===a.target.nodeType?a.target.parentNode:a.target,this.currentTarget=a.currentTarget,this.relatedTarget=a.relatedTarget):this.type=a,b&&r.extend(this,b),this.timeStamp=a&&a.timeStamp||r.now(),void(this[r.expando]=!0)):new r.Event(a,b)},r.Event.prototype={constructor:r.Event,isDefaultPrevented:wa,isPropagationStopped:wa,isImmediatePropagationStopped:wa,isSimulated:!1,preventDefault:function(){var a=this.originalEvent;this.isDefaultPrevented=va,a&&!this.isSimulated&&a.preventDefault()},stopPropagation:function(){var a=this.originalEvent;this.isPropagationStopped=va,a&&!this.isSimulated&&a.stopPropagation()},stopImmediatePropagation:function(){var a=this.originalEvent;this.isImmediatePropagationStopped=va,a&&!this.isSimulated&&a.stopImmediatePropagation(),this.stopPropagation()}},r.each({altKey:!0,bubbles:!0,cancelable:!0,changedTouches:!0,ctrlKey:!0,detail:!0,eventPhase:!0,metaKey:!0,pageX:!0,pageY:!0,shiftKey:!0,view:!0,"char":!0,charCode:!0,key:!0,keyCode:!0,button:!0,buttons:!0,clientX:!0,clientY:!0,offsetX:!0,offsetY:!0,pointerId:!0,pointerType:!0,screenX:!0,screenY:!0,targetTouches:!0,toElement:!0,touches:!0,which:function(a){var b=a.button;return null==a.which&&sa.test(a.type)?null!=a.charCode?a.charCode:a.keyCode:!a.which&&void 0!==b&&ta.test(a.type)?1&b?1:2&b?3:4&b?2:0:a.which}},r.event.addProp),r.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(a,b){r.event.special[a]={delegateType:b,bindType:b,handle:function(a){var c,d=this,e=a.relatedTarget,f=a.handleObj;return e&&(e===d||r.contains(d,e))||(a.type=f.origType,c=f.handler.apply(this,arguments),a.type=b),c}}}),r.fn.extend({on:function(a,b,c,d){return ya(this,a,b,c,d)},one:function(a,b,c,d){return ya(this,a,b,c,d,1)},off:function(a,b,c){var d,e;if(a&&a.preventDefault&&a.handleObj)return d=a.handleObj,r(a.delegateTarget).off(d.namespace?d.origType+"."+d.namespace:d.origType,d.selector,d.handler),this;if("object"==typeof a){for(e in a)this.off(e,b,a[e]);return this}return b!==!1&&"function"!=typeof b||(c=b,b=void 0),c===!1&&(c=wa),this.each(function(){r.event.remove(this,a,c,b)})}});var za=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([a-z][^\/\0>\x20\t\r\n\f]*)[^>]*)\/>/gi,Aa=/<script|<style|<link/i,Ba=/checked\s*(?:[^=]|=\s*.checked.)/i,Ca=/^true\/(.*)/,Da=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g;function Ea(a,b){return B(a,"table")&&B(11!==b.nodeType?b:b.firstChild,"tr")?r(">tbody",a)[0]||a:a}function Fa(a){return a.type=(null!==a.getAttribute("type"))+"/"+a.type,a}function Ga(a){var b=Ca.exec(a.type);return b?a.type=b[1]:a.removeAttribute("type"),a}function Ha(a,b){var c,d,e,f,g,h,i,j;if(1===b.nodeType){if(W.hasData(a)&&(f=W.access(a),g=W.set(b,f),j=f.events)){delete g.handle,g.events={};for(e in j)for(c=0,d=j[e].length;c<d;c++)r.event.add(b,e,j[e][c])}X.hasData(a)&&(h=X.access(a),i=r.extend({},h),X.set(b,i))}}function Ia(a,b){var c=b.nodeName.toLowerCase();"input"===c&&ja.test(a.type)?b.checked=a.checked:"input"!==c&&"textarea"!==c||(b.defaultValue=a.defaultValue)}function Ja(a,b,c,d){b=g.apply([],b);var e,f,h,i,j,k,l=0,m=a.length,n=m-1,q=b[0],s=r.isFunction(q);if(s||m>1&&"string"==typeof q&&!o.checkClone&&Ba.test(q))return a.each(function(e){var f=a.eq(e);s&&(b[0]=q.call(this,e,f.html())),Ja(f,b,c,d)});if(m&&(e=qa(b,a[0].ownerDocument,!1,a,d),f=e.firstChild,1===e.childNodes.length&&(e=f),f||d)){for(h=r.map(na(e,"script"),Fa),i=h.length;l<m;l++)j=e,l!==n&&(j=r.clone(j,!0,!0),i&&r.merge(h,na(j,"script"))),c.call(a[l],j,l);if(i)for(k=h[h.length-1].ownerDocument,r.map(h,Ga),l=0;l<i;l++)j=h[l],la.test(j.type||"")&&!W.access(j,"globalEval")&&r.contains(k,j)&&(j.src?r._evalUrl&&r._evalUrl(j.src):p(j.textContent.replace(Da,""),k))}return a}function Ka(a,b,c){for(var d,e=b?r.filter(b,a):a,f=0;null!=(d=e[f]);f++)c||1!==d.nodeType||r.cleanData(na(d)),d.parentNode&&(c&&r.contains(d.ownerDocument,d)&&oa(na(d,"script")),d.parentNode.removeChild(d));return a}r.extend({htmlPrefilter:function(a){return a.replace(za,"<$1></$2>")},clone:function(a,b,c){var d,e,f,g,h=a.cloneNode(!0),i=r.contains(a.ownerDocument,a);if(!(o.noCloneChecked||1!==a.nodeType&&11!==a.nodeType||r.isXMLDoc(a)))for(g=na(h),f=na(a),d=0,e=f.length;d<e;d++)Ia(f[d],g[d]);if(b)if(c)for(f=f||na(a),g=g||na(h),d=0,e=f.length;d<e;d++)Ha(f[d],g[d]);else Ha(a,h);return g=na(h,"script"),g.length>0&&oa(g,!i&&na(a,"script")),h},cleanData:function(a){for(var b,c,d,e=r.event.special,f=0;void 0!==(c=a[f]);f++)if(U(c)){if(b=c[W.expando]){if(b.events)for(d in b.events)e[d]?r.event.remove(c,d):r.removeEvent(c,d,b.handle);c[W.expando]=void 0}c[X.expando]&&(c[X.expando]=void 0)}}}),r.fn.extend({detach:function(a){return Ka(this,a,!0)},remove:function(a){return Ka(this,a)},text:function(a){return T(this,function(a){return void 0===a?r.text(this):this.empty().each(function(){1!==this.nodeType&&11!==this.nodeType&&9!==this.nodeType||(this.textContent=a)})},null,a,arguments.length)},append:function(){return Ja(this,arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=Ea(this,a);b.appendChild(a)}})},prepend:function(){return Ja(this,arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=Ea(this,a);b.insertBefore(a,b.firstChild)}})},before:function(){return Ja(this,arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this)})},after:function(){return Ja(this,arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this.nextSibling)})},empty:function(){for(var a,b=0;null!=(a=this[b]);b++)1===a.nodeType&&(r.cleanData(na(a,!1)),a.textContent="");return this},clone:function(a,b){return a=null!=a&&a,b=null==b?a:b,this.map(function(){return r.clone(this,a,b)})},html:function(a){return T(this,function(a){var b=this[0]||{},c=0,d=this.length;if(void 0===a&&1===b.nodeType)return b.innerHTML;if("string"==typeof a&&!Aa.test(a)&&!ma[(ka.exec(a)||["",""])[1].toLowerCase()]){a=r.htmlPrefilter(a);try{for(;c<d;c++)b=this[c]||{},1===b.nodeType&&(r.cleanData(na(b,!1)),b.innerHTML=a);b=0}catch(e){}}b&&this.empty().append(a)},null,a,arguments.length)},replaceWith:function(){var a=[];return Ja(this,arguments,function(b){var c=this.parentNode;r.inArray(this,a)<0&&(r.cleanData(na(this)),c&&c.replaceChild(b,this))},a)}}),r.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(a,b){r.fn[a]=function(a){for(var c,d=[],e=r(a),f=e.length-1,g=0;g<=f;g++)c=g===f?this:this.clone(!0),r(e[g])[b](c),h.apply(d,c.get());return this.pushStack(d)}});var La=/^margin/,Ma=new RegExp("^("+aa+")(?!px)[a-z%]+$","i"),Na=function(b){var c=b.ownerDocument.defaultView;return c&&c.opener||(c=a),c.getComputedStyle(b)};!function(){function b(){if(i){i.style.cssText="box-sizing:border-box;position:relative;display:block;margin:auto;border:1px;padding:1px;top:1%;width:50%",i.innerHTML="",ra.appendChild(h);var b=a.getComputedStyle(i);c="1%"!==b.top,g="2px"===b.marginLeft,e="4px"===b.width,i.style.marginRight="50%",f="4px"===b.marginRight,ra.removeChild(h),i=null}}var c,e,f,g,h=d.createElement("div"),i=d.createElement("div");i.style&&(i.style.backgroundClip="content-box",i.cloneNode(!0).style.backgroundClip="",o.clearCloneStyle="content-box"===i.style.backgroundClip,h.style.cssText="border:0;width:8px;height:0;top:0;left:-9999px;padding:0;margin-top:1px;position:absolute",h.appendChild(i),r.extend(o,{pixelPosition:function(){return b(),c},boxSizingReliable:function(){return b(),e},pixelMarginRight:function(){return b(),f},reliableMarginLeft:function(){return b(),g}}))}();function Oa(a,b,c){var d,e,f,g,h=a.style;return c=c||Na(a),c&&(g=c.getPropertyValue(b)||c[b],""!==g||r.contains(a.ownerDocument,a)||(g=r.style(a,b)),!o.pixelMarginRight()&&Ma.test(g)&&La.test(b)&&(d=h.width,e=h.minWidth,f=h.maxWidth,h.minWidth=h.maxWidth=h.width=g,g=c.width,h.width=d,h.minWidth=e,h.maxWidth=f)),void 0!==g?g+"":g}function Pa(a,b){return{get:function(){return a()?void delete this.get:(this.get=b).apply(this,arguments)}}}var Qa=/^(none|table(?!-c[ea]).+)/,Ra=/^--/,Sa={position:"absolute",visibility:"hidden",display:"block"},Ta={letterSpacing:"0",fontWeight:"400"},Ua=["Webkit","Moz","ms"],Va=d.createElement("div").style;function Wa(a){if(a in Va)return a;var b=a[0].toUpperCase()+a.slice(1),c=Ua.length;while(c--)if(a=Ua[c]+b,a in Va)return a}function Xa(a){var b=r.cssProps[a];return b||(b=r.cssProps[a]=Wa(a)||a),b}function Ya(a,b,c){var d=ba.exec(b);return d?Math.max(0,d[2]-(c||0))+(d[3]||"px"):b}function Za(a,b,c,d,e){var f,g=0;for(f=c===(d?"border":"content")?4:"width"===b?1:0;f<4;f+=2)"margin"===c&&(g+=r.css(a,c+ca[f],!0,e)),d?("content"===c&&(g-=r.css(a,"padding"+ca[f],!0,e)),"margin"!==c&&(g-=r.css(a,"border"+ca[f]+"Width",!0,e))):(g+=r.css(a,"padding"+ca[f],!0,e),"padding"!==c&&(g+=r.css(a,"border"+ca[f]+"Width",!0,e)));return g}function $a(a,b,c){var d,e=Na(a),f=Oa(a,b,e),g="border-box"===r.css(a,"boxSizing",!1,e);return Ma.test(f)?f:(d=g&&(o.boxSizingReliable()||f===a.style[b]),"auto"===f&&(f=a["offset"+b[0].toUpperCase()+b.slice(1)]),f=parseFloat(f)||0,f+Za(a,b,c||(g?"border":"content"),d,e)+"px")}r.extend({cssHooks:{opacity:{get:function(a,b){if(b){var c=Oa(a,"opacity");return""===c?"1":c}}}},cssNumber:{animationIterationCount:!0,columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":"cssFloat"},style:function(a,b,c,d){if(a&&3!==a.nodeType&&8!==a.nodeType&&a.style){var e,f,g,h=r.camelCase(b),i=Ra.test(b),j=a.style;return i||(b=Xa(h)),g=r.cssHooks[b]||r.cssHooks[h],void 0===c?g&&"get"in g&&void 0!==(e=g.get(a,!1,d))?e:j[b]:(f=typeof c,"string"===f&&(e=ba.exec(c))&&e[1]&&(c=fa(a,b,e),f="number"),null!=c&&c===c&&("number"===f&&(c+=e&&e[3]||(r.cssNumber[h]?"":"px")),o.clearCloneStyle||""!==c||0!==b.indexOf("background")||(j[b]="inherit"),g&&"set"in g&&void 0===(c=g.set(a,c,d))||(i?j.setProperty(b,c):j[b]=c)),void 0)}},css:function(a,b,c,d){var e,f,g,h=r.camelCase(b),i=Ra.test(b);return i||(b=Xa(h)),g=r.cssHooks[b]||r.cssHooks[h],g&&"get"in g&&(e=g.get(a,!0,c)),void 0===e&&(e=Oa(a,b,d)),"normal"===e&&b in Ta&&(e=Ta[b]),""===c||c?(f=parseFloat(e),c===!0||isFinite(f)?f||0:e):e}}),r.each(["height","width"],function(a,b){r.cssHooks[b]={get:function(a,c,d){if(c)return!Qa.test(r.css(a,"display"))||a.getClientRects().length&&a.getBoundingClientRect().width?$a(a,b,d):ea(a,Sa,function(){return $a(a,b,d)})},set:function(a,c,d){var e,f=d&&Na(a),g=d&&Za(a,b,d,"border-box"===r.css(a,"boxSizing",!1,f),f);return g&&(e=ba.exec(c))&&"px"!==(e[3]||"px")&&(a.style[b]=c,c=r.css(a,b)),Ya(a,c,g)}}}),r.cssHooks.marginLeft=Pa(o.reliableMarginLeft,function(a,b){if(b)return(parseFloat(Oa(a,"marginLeft"))||a.getBoundingClientRect().left-ea(a,{marginLeft:0},function(){return a.getBoundingClientRect().left}))+"px"}),r.each({margin:"",padding:"",border:"Width"},function(a,b){r.cssHooks[a+b]={expand:function(c){for(var d=0,e={},f="string"==typeof c?c.split(" "):[c];d<4;d++)e[a+ca[d]+b]=f[d]||f[d-2]||f[0];return e}},La.test(a)||(r.cssHooks[a+b].set=Ya)}),r.fn.extend({css:function(a,b){return T(this,function(a,b,c){var d,e,f={},g=0;if(Array.isArray(b)){for(d=Na(a),e=b.length;g<e;g++)f[b[g]]=r.css(a,b[g],!1,d);return f}return void 0!==c?r.style(a,b,c):r.css(a,b)},a,b,arguments.length>1)}});function _a(a,b,c,d,e){return new _a.prototype.init(a,b,c,d,e)}r.Tween=_a,_a.prototype={constructor:_a,init:function(a,b,c,d,e,f){this.elem=a,this.prop=c,this.easing=e||r.easing._default,this.options=b,this.start=this.now=this.cur(),this.end=d,this.unit=f||(r.cssNumber[c]?"":"px")},cur:function(){var a=_a.propHooks[this.prop];return a&&a.get?a.get(this):_a.propHooks._default.get(this)},run:function(a){var b,c=_a.propHooks[this.prop];return this.options.duration?this.pos=b=r.easing[this.easing](a,this.options.duration*a,0,1,this.options.duration):this.pos=b=a,this.now=(this.end-this.start)*b+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),c&&c.set?c.set(this):_a.propHooks._default.set(this),this}},_a.prototype.init.prototype=_a.prototype,_a.propHooks={_default:{get:function(a){var b;return 1!==a.elem.nodeType||null!=a.elem[a.prop]&&null==a.elem.style[a.prop]?a.elem[a.prop]:(b=r.css(a.elem,a.prop,""),b&&"auto"!==b?b:0)},set:function(a){r.fx.step[a.prop]?r.fx.step[a.prop](a):1!==a.elem.nodeType||null==a.elem.style[r.cssProps[a.prop]]&&!r.cssHooks[a.prop]?a.elem[a.prop]=a.now:r.style(a.elem,a.prop,a.now+a.unit)}}},_a.propHooks.scrollTop=_a.propHooks.scrollLeft={set:function(a){a.elem.nodeType&&a.elem.parentNode&&(a.elem[a.prop]=a.now)}},r.easing={linear:function(a){return a},swing:function(a){return.5-Math.cos(a*Math.PI)/2},_default:"swing"},r.fx=_a.prototype.init,r.fx.step={};var ab,bb,cb=/^(?:toggle|show|hide)$/,db=/queueHooks$/;function eb(){bb&&(d.hidden===!1&&a.requestAnimationFrame?a.requestAnimationFrame(eb):a.setTimeout(eb,r.fx.interval),r.fx.tick())}function fb(){return a.setTimeout(function(){ab=void 0}),ab=r.now()}function gb(a,b){var c,d=0,e={height:a};for(b=b?1:0;d<4;d+=2-b)c=ca[d],e["margin"+c]=e["padding"+c]=a;return b&&(e.opacity=e.width=a),e}function hb(a,b,c){for(var d,e=(kb.tweeners[b]||[]).concat(kb.tweeners["*"]),f=0,g=e.length;f<g;f++)if(d=e[f].call(c,b,a))return d}function ib(a,b,c){var d,e,f,g,h,i,j,k,l="width"in b||"height"in b,m=this,n={},o=a.style,p=a.nodeType&&da(a),q=W.get(a,"fxshow");c.queue||(g=r._queueHooks(a,"fx"),null==g.unqueued&&(g.unqueued=0,h=g.empty.fire,g.empty.fire=function(){g.unqueued||h()}),g.unqueued++,m.always(function(){m.always(function(){g.unqueued--,r.queue(a,"fx").length||g.empty.fire()})}));for(d in b)if(e=b[d],cb.test(e)){if(delete b[d],f=f||"toggle"===e,e===(p?"hide":"show")){if("show"!==e||!q||void 0===q[d])continue;p=!0}n[d]=q&&q[d]||r.style(a,d)}if(i=!r.isEmptyObject(b),i||!r.isEmptyObject(n)){l&&1===a.nodeType&&(c.overflow=[o.overflow,o.overflowX,o.overflowY],j=q&&q.display,null==j&&(j=W.get(a,"display")),k=r.css(a,"display"),"none"===k&&(j?k=j:(ia([a],!0),j=a.style.display||j,k=r.css(a,"display"),ia([a]))),("inline"===k||"inline-block"===k&&null!=j)&&"none"===r.css(a,"float")&&(i||(m.done(function(){o.display=j}),null==j&&(k=o.display,j="none"===k?"":k)),o.display="inline-block")),c.overflow&&(o.overflow="hidden",m.always(function(){o.overflow=c.overflow[0],o.overflowX=c.overflow[1],o.overflowY=c.overflow[2]})),i=!1;for(d in n)i||(q?"hidden"in q&&(p=q.hidden):q=W.access(a,"fxshow",{display:j}),f&&(q.hidden=!p),p&&ia([a],!0),m.done(function(){p||ia([a]),W.remove(a,"fxshow");for(d in n)r.style(a,d,n[d])})),i=hb(p?q[d]:0,d,m),d in q||(q[d]=i.start,p&&(i.end=i.start,i.start=0))}}function jb(a,b){var c,d,e,f,g;for(c in a)if(d=r.camelCase(c),e=b[d],f=a[c],Array.isArray(f)&&(e=f[1],f=a[c]=f[0]),c!==d&&(a[d]=f,delete a[c]),g=r.cssHooks[d],g&&"expand"in g){f=g.expand(f),delete a[d];for(c in f)c in a||(a[c]=f[c],b[c]=e)}else b[d]=e}function kb(a,b,c){var d,e,f=0,g=kb.prefilters.length,h=r.Deferred().always(function(){delete i.elem}),i=function(){if(e)return!1;for(var b=ab||fb(),c=Math.max(0,j.startTime+j.duration-b),d=c/j.duration||0,f=1-d,g=0,i=j.tweens.length;g<i;g++)j.tweens[g].run(f);return h.notifyWith(a,[j,f,c]),f<1&&i?c:(i||h.notifyWith(a,[j,1,0]),h.resolveWith(a,[j]),!1)},j=h.promise({elem:a,props:r.extend({},b),opts:r.extend(!0,{specialEasing:{},easing:r.easing._default},c),originalProperties:b,originalOptions:c,startTime:ab||fb(),duration:c.duration,tweens:[],createTween:function(b,c){var d=r.Tween(a,j.opts,b,c,j.opts.specialEasing[b]||j.opts.easing);return j.tweens.push(d),d},stop:function(b){var c=0,d=b?j.tweens.length:0;if(e)return this;for(e=!0;c<d;c++)j.tweens[c].run(1);return b?(h.notifyWith(a,[j,1,0]),h.resolveWith(a,[j,b])):h.rejectWith(a,[j,b]),this}}),k=j.props;for(jb(k,j.opts.specialEasing);f<g;f++)if(d=kb.prefilters[f].call(j,a,k,j.opts))return r.isFunction(d.stop)&&(r._queueHooks(j.elem,j.opts.queue).stop=r.proxy(d.stop,d)),d;return r.map(k,hb,j),r.isFunction(j.opts.start)&&j.opts.start.call(a,j),j.progress(j.opts.progress).done(j.opts.done,j.opts.complete).fail(j.opts.fail).always(j.opts.always),r.fx.timer(r.extend(i,{elem:a,anim:j,queue:j.opts.queue})),j}r.Animation=r.extend(kb,{tweeners:{"*":[function(a,b){var c=this.createTween(a,b);return fa(c.elem,a,ba.exec(b),c),c}]},tweener:function(a,b){r.isFunction(a)?(b=a,a=["*"]):a=a.match(L);for(var c,d=0,e=a.length;d<e;d++)c=a[d],kb.tweeners[c]=kb.tweeners[c]||[],kb.tweeners[c].unshift(b)},prefilters:[ib],prefilter:function(a,b){b?kb.prefilters.unshift(a):kb.prefilters.push(a)}}),r.speed=function(a,b,c){var d=a&&"object"==typeof a?r.extend({},a):{complete:c||!c&&b||r.isFunction(a)&&a,duration:a,easing:c&&b||b&&!r.isFunction(b)&&b};return r.fx.off?d.duration=0:"number"!=typeof d.duration&&(d.duration in r.fx.speeds?d.duration=r.fx.speeds[d.duration]:d.duration=r.fx.speeds._default),null!=d.queue&&d.queue!==!0||(d.queue="fx"),d.old=d.complete,d.complete=function(){r.isFunction(d.old)&&d.old.call(this),d.queue&&r.dequeue(this,d.queue)},d},r.fn.extend({fadeTo:function(a,b,c,d){return this.filter(da).css("opacity",0).show().end().animate({opacity:b},a,c,d)},animate:function(a,b,c,d){var e=r.isEmptyObject(a),f=r.speed(b,c,d),g=function(){var b=kb(this,r.extend({},a),f);(e||W.get(this,"finish"))&&b.stop(!0)};return g.finish=g,e||f.queue===!1?this.each(g):this.queue(f.queue,g)},stop:function(a,b,c){var d=function(a){var b=a.stop;delete a.stop,b(c)};return"string"!=typeof a&&(c=b,b=a,a=void 0),b&&a!==!1&&this.queue(a||"fx",[]),this.each(function(){var b=!0,e=null!=a&&a+"queueHooks",f=r.timers,g=W.get(this);if(e)g[e]&&g[e].stop&&d(g[e]);else for(e in g)g[e]&&g[e].stop&&db.test(e)&&d(g[e]);for(e=f.length;e--;)f[e].elem!==this||null!=a&&f[e].queue!==a||(f[e].anim.stop(c),b=!1,f.splice(e,1));!b&&c||r.dequeue(this,a)})},finish:function(a){return a!==!1&&(a=a||"fx"),this.each(function(){var b,c=W.get(this),d=c[a+"queue"],e=c[a+"queueHooks"],f=r.timers,g=d?d.length:0;for(c.finish=!0,r.queue(this,a,[]),e&&e.stop&&e.stop.call(this,!0),b=f.length;b--;)f[b].elem===this&&f[b].queue===a&&(f[b].anim.stop(!0),f.splice(b,1));for(b=0;b<g;b++)d[b]&&d[b].finish&&d[b].finish.call(this);delete c.finish})}}),r.each(["toggle","show","hide"],function(a,b){var c=r.fn[b];r.fn[b]=function(a,d,e){return null==a||"boolean"==typeof a?c.apply(this,arguments):this.animate(gb(b,!0),a,d,e)}}),r.each({slideDown:gb("show"),slideUp:gb("hide"),slideToggle:gb("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(a,b){r.fn[a]=function(a,c,d){return this.animate(b,a,c,d)}}),r.timers=[],r.fx.tick=function(){var a,b=0,c=r.timers;for(ab=r.now();b<c.length;b++)a=c[b],a()||c[b]!==a||c.splice(b--,1);c.length||r.fx.stop(),ab=void 0},r.fx.timer=function(a){r.timers.push(a),r.fx.start()},r.fx.interval=13,r.fx.start=function(){bb||(bb=!0,eb())},r.fx.stop=function(){bb=null},r.fx.speeds={slow:600,fast:200,_default:400},r.fn.delay=function(b,c){return b=r.fx?r.fx.speeds[b]||b:b,c=c||"fx",this.queue(c,function(c,d){var e=a.setTimeout(c,b);d.stop=function(){a.clearTimeout(e)}})},function(){var a=d.createElement("input"),b=d.createElement("select"),c=b.appendChild(d.createElement("option"));a.type="checkbox",o.checkOn=""!==a.value,o.optSelected=c.selected,a=d.createElement("input"),a.value="t",a.type="radio",o.radioValue="t"===a.value}();var lb,mb=r.expr.attrHandle;r.fn.extend({attr:function(a,b){return T(this,r.attr,a,b,arguments.length>1)},removeAttr:function(a){return this.each(function(){r.removeAttr(this,a)})}}),r.extend({attr:function(a,b,c){var d,e,f=a.nodeType;if(3!==f&&8!==f&&2!==f)return"undefined"==typeof a.getAttribute?r.prop(a,b,c):(1===f&&r.isXMLDoc(a)||(e=r.attrHooks[b.toLowerCase()]||(r.expr.match.bool.test(b)?lb:void 0)),void 0!==c?null===c?void r.removeAttr(a,b):e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:(a.setAttribute(b,c+""),c):e&&"get"in e&&null!==(d=e.get(a,b))?d:(d=r.find.attr(a,b),
null==d?void 0:d))},attrHooks:{type:{set:function(a,b){if(!o.radioValue&&"radio"===b&&B(a,"input")){var c=a.value;return a.setAttribute("type",b),c&&(a.value=c),b}}}},removeAttr:function(a,b){var c,d=0,e=b&&b.match(L);if(e&&1===a.nodeType)while(c=e[d++])a.removeAttribute(c)}}),lb={set:function(a,b,c){return b===!1?r.removeAttr(a,c):a.setAttribute(c,c),c}},r.each(r.expr.match.bool.source.match(/\w+/g),function(a,b){var c=mb[b]||r.find.attr;mb[b]=function(a,b,d){var e,f,g=b.toLowerCase();return d||(f=mb[g],mb[g]=e,e=null!=c(a,b,d)?g:null,mb[g]=f),e}});var nb=/^(?:input|select|textarea|button)$/i,ob=/^(?:a|area)$/i;r.fn.extend({prop:function(a,b){return T(this,r.prop,a,b,arguments.length>1)},removeProp:function(a){return this.each(function(){delete this[r.propFix[a]||a]})}}),r.extend({prop:function(a,b,c){var d,e,f=a.nodeType;if(3!==f&&8!==f&&2!==f)return 1===f&&r.isXMLDoc(a)||(b=r.propFix[b]||b,e=r.propHooks[b]),void 0!==c?e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:a[b]=c:e&&"get"in e&&null!==(d=e.get(a,b))?d:a[b]},propHooks:{tabIndex:{get:function(a){var b=r.find.attr(a,"tabindex");return b?parseInt(b,10):nb.test(a.nodeName)||ob.test(a.nodeName)&&a.href?0:-1}}},propFix:{"for":"htmlFor","class":"className"}}),o.optSelected||(r.propHooks.selected={get:function(a){var b=a.parentNode;return b&&b.parentNode&&b.parentNode.selectedIndex,null},set:function(a){var b=a.parentNode;b&&(b.selectedIndex,b.parentNode&&b.parentNode.selectedIndex)}}),r.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){r.propFix[this.toLowerCase()]=this});function pb(a){var b=a.match(L)||[];return b.join(" ")}function qb(a){return a.getAttribute&&a.getAttribute("class")||""}r.fn.extend({addClass:function(a){var b,c,d,e,f,g,h,i=0;if(r.isFunction(a))return this.each(function(b){r(this).addClass(a.call(this,b,qb(this)))});if("string"==typeof a&&a){b=a.match(L)||[];while(c=this[i++])if(e=qb(c),d=1===c.nodeType&&" "+pb(e)+" "){g=0;while(f=b[g++])d.indexOf(" "+f+" ")<0&&(d+=f+" ");h=pb(d),e!==h&&c.setAttribute("class",h)}}return this},removeClass:function(a){var b,c,d,e,f,g,h,i=0;if(r.isFunction(a))return this.each(function(b){r(this).removeClass(a.call(this,b,qb(this)))});if(!arguments.length)return this.attr("class","");if("string"==typeof a&&a){b=a.match(L)||[];while(c=this[i++])if(e=qb(c),d=1===c.nodeType&&" "+pb(e)+" "){g=0;while(f=b[g++])while(d.indexOf(" "+f+" ")>-1)d=d.replace(" "+f+" "," ");h=pb(d),e!==h&&c.setAttribute("class",h)}}return this},toggleClass:function(a,b){var c=typeof a;return"boolean"==typeof b&&"string"===c?b?this.addClass(a):this.removeClass(a):r.isFunction(a)?this.each(function(c){r(this).toggleClass(a.call(this,c,qb(this),b),b)}):this.each(function(){var b,d,e,f;if("string"===c){d=0,e=r(this),f=a.match(L)||[];while(b=f[d++])e.hasClass(b)?e.removeClass(b):e.addClass(b)}else void 0!==a&&"boolean"!==c||(b=qb(this),b&&W.set(this,"__className__",b),this.setAttribute&&this.setAttribute("class",b||a===!1?"":W.get(this,"__className__")||""))})},hasClass:function(a){var b,c,d=0;b=" "+a+" ";while(c=this[d++])if(1===c.nodeType&&(" "+pb(qb(c))+" ").indexOf(b)>-1)return!0;return!1}});var rb=/\r/g;r.fn.extend({val:function(a){var b,c,d,e=this[0];{if(arguments.length)return d=r.isFunction(a),this.each(function(c){var e;1===this.nodeType&&(e=d?a.call(this,c,r(this).val()):a,null==e?e="":"number"==typeof e?e+="":Array.isArray(e)&&(e=r.map(e,function(a){return null==a?"":a+""})),b=r.valHooks[this.type]||r.valHooks[this.nodeName.toLowerCase()],b&&"set"in b&&void 0!==b.set(this,e,"value")||(this.value=e))});if(e)return b=r.valHooks[e.type]||r.valHooks[e.nodeName.toLowerCase()],b&&"get"in b&&void 0!==(c=b.get(e,"value"))?c:(c=e.value,"string"==typeof c?c.replace(rb,""):null==c?"":c)}}}),r.extend({valHooks:{option:{get:function(a){var b=r.find.attr(a,"value");return null!=b?b:pb(r.text(a))}},select:{get:function(a){var b,c,d,e=a.options,f=a.selectedIndex,g="select-one"===a.type,h=g?null:[],i=g?f+1:e.length;for(d=f<0?i:g?f:0;d<i;d++)if(c=e[d],(c.selected||d===f)&&!c.disabled&&(!c.parentNode.disabled||!B(c.parentNode,"optgroup"))){if(b=r(c).val(),g)return b;h.push(b)}return h},set:function(a,b){var c,d,e=a.options,f=r.makeArray(b),g=e.length;while(g--)d=e[g],(d.selected=r.inArray(r.valHooks.option.get(d),f)>-1)&&(c=!0);return c||(a.selectedIndex=-1),f}}}}),r.each(["radio","checkbox"],function(){r.valHooks[this]={set:function(a,b){if(Array.isArray(b))return a.checked=r.inArray(r(a).val(),b)>-1}},o.checkOn||(r.valHooks[this].get=function(a){return null===a.getAttribute("value")?"on":a.value})});var sb=/^(?:focusinfocus|focusoutblur)$/;r.extend(r.event,{trigger:function(b,c,e,f){var g,h,i,j,k,m,n,o=[e||d],p=l.call(b,"type")?b.type:b,q=l.call(b,"namespace")?b.namespace.split("."):[];if(h=i=e=e||d,3!==e.nodeType&&8!==e.nodeType&&!sb.test(p+r.event.triggered)&&(p.indexOf(".")>-1&&(q=p.split("."),p=q.shift(),q.sort()),k=p.indexOf(":")<0&&"on"+p,b=b[r.expando]?b:new r.Event(p,"object"==typeof b&&b),b.isTrigger=f?2:3,b.namespace=q.join("."),b.rnamespace=b.namespace?new RegExp("(^|\\.)"+q.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,b.result=void 0,b.target||(b.target=e),c=null==c?[b]:r.makeArray(c,[b]),n=r.event.special[p]||{},f||!n.trigger||n.trigger.apply(e,c)!==!1)){if(!f&&!n.noBubble&&!r.isWindow(e)){for(j=n.delegateType||p,sb.test(j+p)||(h=h.parentNode);h;h=h.parentNode)o.push(h),i=h;i===(e.ownerDocument||d)&&o.push(i.defaultView||i.parentWindow||a)}g=0;while((h=o[g++])&&!b.isPropagationStopped())b.type=g>1?j:n.bindType||p,m=(W.get(h,"events")||{})[b.type]&&W.get(h,"handle"),m&&m.apply(h,c),m=k&&h[k],m&&m.apply&&U(h)&&(b.result=m.apply(h,c),b.result===!1&&b.preventDefault());return b.type=p,f||b.isDefaultPrevented()||n._default&&n._default.apply(o.pop(),c)!==!1||!U(e)||k&&r.isFunction(e[p])&&!r.isWindow(e)&&(i=e[k],i&&(e[k]=null),r.event.triggered=p,e[p](),r.event.triggered=void 0,i&&(e[k]=i)),b.result}},simulate:function(a,b,c){var d=r.extend(new r.Event,c,{type:a,isSimulated:!0});r.event.trigger(d,null,b)}}),r.fn.extend({trigger:function(a,b){return this.each(function(){r.event.trigger(a,b,this)})},triggerHandler:function(a,b){var c=this[0];if(c)return r.event.trigger(a,b,c,!0)}}),r.each("blur focus focusin focusout resize scroll click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup contextmenu".split(" "),function(a,b){r.fn[b]=function(a,c){return arguments.length>0?this.on(b,null,a,c):this.trigger(b)}}),r.fn.extend({hover:function(a,b){return this.mouseenter(a).mouseleave(b||a)}}),o.focusin="onfocusin"in a,o.focusin||r.each({focus:"focusin",blur:"focusout"},function(a,b){var c=function(a){r.event.simulate(b,a.target,r.event.fix(a))};r.event.special[b]={setup:function(){var d=this.ownerDocument||this,e=W.access(d,b);e||d.addEventListener(a,c,!0),W.access(d,b,(e||0)+1)},teardown:function(){var d=this.ownerDocument||this,e=W.access(d,b)-1;e?W.access(d,b,e):(d.removeEventListener(a,c,!0),W.remove(d,b))}}});var tb=a.location,ub=r.now(),vb=/\?/;r.parseXML=function(b){var c;if(!b||"string"!=typeof b)return null;try{c=(new a.DOMParser).parseFromString(b,"text/xml")}catch(d){c=void 0}return c&&!c.getElementsByTagName("parsererror").length||r.error("Invalid XML: "+b),c};var wb=/\[\]$/,xb=/\r?\n/g,yb=/^(?:submit|button|image|reset|file)$/i,zb=/^(?:input|select|textarea|keygen)/i;function Ab(a,b,c,d){var e;if(Array.isArray(b))r.each(b,function(b,e){c||wb.test(a)?d(a,e):Ab(a+"["+("object"==typeof e&&null!=e?b:"")+"]",e,c,d)});else if(c||"object"!==r.type(b))d(a,b);else for(e in b)Ab(a+"["+e+"]",b[e],c,d)}r.param=function(a,b){var c,d=[],e=function(a,b){var c=r.isFunction(b)?b():b;d[d.length]=encodeURIComponent(a)+"="+encodeURIComponent(null==c?"":c)};if(Array.isArray(a)||a.jquery&&!r.isPlainObject(a))r.each(a,function(){e(this.name,this.value)});else for(c in a)Ab(c,a[c],b,e);return d.join("&")},r.fn.extend({serialize:function(){return r.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var a=r.prop(this,"elements");return a?r.makeArray(a):this}).filter(function(){var a=this.type;return this.name&&!r(this).is(":disabled")&&zb.test(this.nodeName)&&!yb.test(a)&&(this.checked||!ja.test(a))}).map(function(a,b){var c=r(this).val();return null==c?null:Array.isArray(c)?r.map(c,function(a){return{name:b.name,value:a.replace(xb,"\r\n")}}):{name:b.name,value:c.replace(xb,"\r\n")}}).get()}});var Bb=/%20/g,Cb=/#.*$/,Db=/([?&])_=[^&]*/,Eb=/^(.*?):[ \t]*([^\r\n]*)$/gm,Fb=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,Gb=/^(?:GET|HEAD)$/,Hb=/^\/\//,Ib={},Jb={},Kb="*/".concat("*"),Lb=d.createElement("a");Lb.href=tb.href;function Mb(a){return function(b,c){"string"!=typeof b&&(c=b,b="*");var d,e=0,f=b.toLowerCase().match(L)||[];if(r.isFunction(c))while(d=f[e++])"+"===d[0]?(d=d.slice(1)||"*",(a[d]=a[d]||[]).unshift(c)):(a[d]=a[d]||[]).push(c)}}function Nb(a,b,c,d){var e={},f=a===Jb;function g(h){var i;return e[h]=!0,r.each(a[h]||[],function(a,h){var j=h(b,c,d);return"string"!=typeof j||f||e[j]?f?!(i=j):void 0:(b.dataTypes.unshift(j),g(j),!1)}),i}return g(b.dataTypes[0])||!e["*"]&&g("*")}function Ob(a,b){var c,d,e=r.ajaxSettings.flatOptions||{};for(c in b)void 0!==b[c]&&((e[c]?a:d||(d={}))[c]=b[c]);return d&&r.extend(!0,a,d),a}function Pb(a,b,c){var d,e,f,g,h=a.contents,i=a.dataTypes;while("*"===i[0])i.shift(),void 0===d&&(d=a.mimeType||b.getResponseHeader("Content-Type"));if(d)for(e in h)if(h[e]&&h[e].test(d)){i.unshift(e);break}if(i[0]in c)f=i[0];else{for(e in c){if(!i[0]||a.converters[e+" "+i[0]]){f=e;break}g||(g=e)}f=f||g}if(f)return f!==i[0]&&i.unshift(f),c[f]}function Qb(a,b,c,d){var e,f,g,h,i,j={},k=a.dataTypes.slice();if(k[1])for(g in a.converters)j[g.toLowerCase()]=a.converters[g];f=k.shift();while(f)if(a.responseFields[f]&&(c[a.responseFields[f]]=b),!i&&d&&a.dataFilter&&(b=a.dataFilter(b,a.dataType)),i=f,f=k.shift())if("*"===f)f=i;else if("*"!==i&&i!==f){if(g=j[i+" "+f]||j["* "+f],!g)for(e in j)if(h=e.split(" "),h[1]===f&&(g=j[i+" "+h[0]]||j["* "+h[0]])){g===!0?g=j[e]:j[e]!==!0&&(f=h[0],k.unshift(h[1]));break}if(g!==!0)if(g&&a["throws"])b=g(b);else try{b=g(b)}catch(l){return{state:"parsererror",error:g?l:"No conversion from "+i+" to "+f}}}return{state:"success",data:b}}r.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:tb.href,type:"GET",isLocal:Fb.test(tb.protocol),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":Kb,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/\bxml\b/,html:/\bhtml/,json:/\bjson\b/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":JSON.parse,"text xml":r.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(a,b){return b?Ob(Ob(a,r.ajaxSettings),b):Ob(r.ajaxSettings,a)},ajaxPrefilter:Mb(Ib),ajaxTransport:Mb(Jb),ajax:function(b,c){"object"==typeof b&&(c=b,b=void 0),c=c||{};var e,f,g,h,i,j,k,l,m,n,o=r.ajaxSetup({},c),p=o.context||o,q=o.context&&(p.nodeType||p.jquery)?r(p):r.event,s=r.Deferred(),t=r.Callbacks("once memory"),u=o.statusCode||{},v={},w={},x="canceled",y={readyState:0,getResponseHeader:function(a){var b;if(k){if(!h){h={};while(b=Eb.exec(g))h[b[1].toLowerCase()]=b[2]}b=h[a.toLowerCase()]}return null==b?null:b},getAllResponseHeaders:function(){return k?g:null},setRequestHeader:function(a,b){return null==k&&(a=w[a.toLowerCase()]=w[a.toLowerCase()]||a,v[a]=b),this},overrideMimeType:function(a){return null==k&&(o.mimeType=a),this},statusCode:function(a){var b;if(a)if(k)y.always(a[y.status]);else for(b in a)u[b]=[u[b],a[b]];return this},abort:function(a){var b=a||x;return e&&e.abort(b),A(0,b),this}};if(s.promise(y),o.url=((b||o.url||tb.href)+"").replace(Hb,tb.protocol+"//"),o.type=c.method||c.type||o.method||o.type,o.dataTypes=(o.dataType||"*").toLowerCase().match(L)||[""],null==o.crossDomain){j=d.createElement("a");try{j.href=o.url,j.href=j.href,o.crossDomain=Lb.protocol+"//"+Lb.host!=j.protocol+"//"+j.host}catch(z){o.crossDomain=!0}}if(o.data&&o.processData&&"string"!=typeof o.data&&(o.data=r.param(o.data,o.traditional)),Nb(Ib,o,c,y),k)return y;l=r.event&&o.global,l&&0===r.active++&&r.event.trigger("ajaxStart"),o.type=o.type.toUpperCase(),o.hasContent=!Gb.test(o.type),f=o.url.replace(Cb,""),o.hasContent?o.data&&o.processData&&0===(o.contentType||"").indexOf("application/x-www-form-urlencoded")&&(o.data=o.data.replace(Bb,"+")):(n=o.url.slice(f.length),o.data&&(f+=(vb.test(f)?"&":"?")+o.data,delete o.data),o.cache===!1&&(f=f.replace(Db,"$1"),n=(vb.test(f)?"&":"?")+"_="+ub++ +n),o.url=f+n),o.ifModified&&(r.lastModified[f]&&y.setRequestHeader("If-Modified-Since",r.lastModified[f]),r.etag[f]&&y.setRequestHeader("If-None-Match",r.etag[f])),(o.data&&o.hasContent&&o.contentType!==!1||c.contentType)&&y.setRequestHeader("Content-Type",o.contentType),y.setRequestHeader("Accept",o.dataTypes[0]&&o.accepts[o.dataTypes[0]]?o.accepts[o.dataTypes[0]]+("*"!==o.dataTypes[0]?", "+Kb+"; q=0.01":""):o.accepts["*"]);for(m in o.headers)y.setRequestHeader(m,o.headers[m]);if(o.beforeSend&&(o.beforeSend.call(p,y,o)===!1||k))return y.abort();if(x="abort",t.add(o.complete),y.done(o.success),y.fail(o.error),e=Nb(Jb,o,c,y)){if(y.readyState=1,l&&q.trigger("ajaxSend",[y,o]),k)return y;o.async&&o.timeout>0&&(i=a.setTimeout(function(){y.abort("timeout")},o.timeout));try{k=!1,e.send(v,A)}catch(z){if(k)throw z;A(-1,z)}}else A(-1,"No Transport");function A(b,c,d,h){var j,m,n,v,w,x=c;k||(k=!0,i&&a.clearTimeout(i),e=void 0,g=h||"",y.readyState=b>0?4:0,j=b>=200&&b<300||304===b,d&&(v=Pb(o,y,d)),v=Qb(o,v,y,j),j?(o.ifModified&&(w=y.getResponseHeader("Last-Modified"),w&&(r.lastModified[f]=w),w=y.getResponseHeader("etag"),w&&(r.etag[f]=w)),204===b||"HEAD"===o.type?x="nocontent":304===b?x="notmodified":(x=v.state,m=v.data,n=v.error,j=!n)):(n=x,!b&&x||(x="error",b<0&&(b=0))),y.status=b,y.statusText=(c||x)+"",j?s.resolveWith(p,[m,x,y]):s.rejectWith(p,[y,x,n]),y.statusCode(u),u=void 0,l&&q.trigger(j?"ajaxSuccess":"ajaxError",[y,o,j?m:n]),t.fireWith(p,[y,x]),l&&(q.trigger("ajaxComplete",[y,o]),--r.active||r.event.trigger("ajaxStop")))}return y},getJSON:function(a,b,c){return r.get(a,b,c,"json")},getScript:function(a,b){return r.get(a,void 0,b,"script")}}),r.each(["get","post"],function(a,b){r[b]=function(a,c,d,e){return r.isFunction(c)&&(e=e||d,d=c,c=void 0),r.ajax(r.extend({url:a,type:b,dataType:e,data:c,success:d},r.isPlainObject(a)&&a))}}),r._evalUrl=function(a){return r.ajax({url:a,type:"GET",dataType:"script",cache:!0,async:!1,global:!1,"throws":!0})},r.fn.extend({wrapAll:function(a){var b;return this[0]&&(r.isFunction(a)&&(a=a.call(this[0])),b=r(a,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&b.insertBefore(this[0]),b.map(function(){var a=this;while(a.firstElementChild)a=a.firstElementChild;return a}).append(this)),this},wrapInner:function(a){return r.isFunction(a)?this.each(function(b){r(this).wrapInner(a.call(this,b))}):this.each(function(){var b=r(this),c=b.contents();c.length?c.wrapAll(a):b.append(a)})},wrap:function(a){var b=r.isFunction(a);return this.each(function(c){r(this).wrapAll(b?a.call(this,c):a)})},unwrap:function(a){return this.parent(a).not("body").each(function(){r(this).replaceWith(this.childNodes)}),this}}),r.expr.pseudos.hidden=function(a){return!r.expr.pseudos.visible(a)},r.expr.pseudos.visible=function(a){return!!(a.offsetWidth||a.offsetHeight||a.getClientRects().length)},r.ajaxSettings.xhr=function(){try{return new a.XMLHttpRequest}catch(b){}};var Rb={0:200,1223:204},Sb=r.ajaxSettings.xhr();o.cors=!!Sb&&"withCredentials"in Sb,o.ajax=Sb=!!Sb,r.ajaxTransport(function(b){var c,d;if(o.cors||Sb&&!b.crossDomain)return{send:function(e,f){var g,h=b.xhr();if(h.open(b.type,b.url,b.async,b.username,b.password),b.xhrFields)for(g in b.xhrFields)h[g]=b.xhrFields[g];b.mimeType&&h.overrideMimeType&&h.overrideMimeType(b.mimeType),b.crossDomain||e["X-Requested-With"]||(e["X-Requested-With"]="XMLHttpRequest");for(g in e)h.setRequestHeader(g,e[g]);c=function(a){return function(){c&&(c=d=h.onload=h.onerror=h.onabort=h.onreadystatechange=null,"abort"===a?h.abort():"error"===a?"number"!=typeof h.status?f(0,"error"):f(h.status,h.statusText):f(Rb[h.status]||h.status,h.statusText,"text"!==(h.responseType||"text")||"string"!=typeof h.responseText?{binary:h.response}:{text:h.responseText},h.getAllResponseHeaders()))}},h.onload=c(),d=h.onerror=c("error"),void 0!==h.onabort?h.onabort=d:h.onreadystatechange=function(){4===h.readyState&&a.setTimeout(function(){c&&d()})},c=c("abort");try{h.send(b.hasContent&&b.data||null)}catch(i){if(c)throw i}},abort:function(){c&&c()}}}),r.ajaxPrefilter(function(a){a.crossDomain&&(a.contents.script=!1)}),r.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/\b(?:java|ecma)script\b/},converters:{"text script":function(a){return r.globalEval(a),a}}}),r.ajaxPrefilter("script",function(a){void 0===a.cache&&(a.cache=!1),a.crossDomain&&(a.type="GET")}),r.ajaxTransport("script",function(a){if(a.crossDomain){var b,c;return{send:function(e,f){b=r("<script>").prop({charset:a.scriptCharset,src:a.url}).on("load error",c=function(a){b.remove(),c=null,a&&f("error"===a.type?404:200,a.type)}),d.head.appendChild(b[0])},abort:function(){c&&c()}}}});var Tb=[],Ub=/(=)\?(?=&|$)|\?\?/;r.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var a=Tb.pop()||r.expando+"_"+ub++;return this[a]=!0,a}}),r.ajaxPrefilter("json jsonp",function(b,c,d){var e,f,g,h=b.jsonp!==!1&&(Ub.test(b.url)?"url":"string"==typeof b.data&&0===(b.contentType||"").indexOf("application/x-www-form-urlencoded")&&Ub.test(b.data)&&"data");if(h||"jsonp"===b.dataTypes[0])return e=b.jsonpCallback=r.isFunction(b.jsonpCallback)?b.jsonpCallback():b.jsonpCallback,h?b[h]=b[h].replace(Ub,"$1"+e):b.jsonp!==!1&&(b.url+=(vb.test(b.url)?"&":"?")+b.jsonp+"="+e),b.converters["script json"]=function(){return g||r.error(e+" was not called"),g[0]},b.dataTypes[0]="json",f=a[e],a[e]=function(){g=arguments},d.always(function(){void 0===f?r(a).removeProp(e):a[e]=f,b[e]&&(b.jsonpCallback=c.jsonpCallback,Tb.push(e)),g&&r.isFunction(f)&&f(g[0]),g=f=void 0}),"script"}),o.createHTMLDocument=function(){var a=d.implementation.createHTMLDocument("").body;return a.innerHTML="<form></form><form></form>",2===a.childNodes.length}(),r.parseHTML=function(a,b,c){if("string"!=typeof a)return[];"boolean"==typeof b&&(c=b,b=!1);var e,f,g;return b||(o.createHTMLDocument?(b=d.implementation.createHTMLDocument(""),e=b.createElement("base"),e.href=d.location.href,b.head.appendChild(e)):b=d),f=C.exec(a),g=!c&&[],f?[b.createElement(f[1])]:(f=qa([a],b,g),g&&g.length&&r(g).remove(),r.merge([],f.childNodes))},r.fn.load=function(a,b,c){var d,e,f,g=this,h=a.indexOf(" ");return h>-1&&(d=pb(a.slice(h)),a=a.slice(0,h)),r.isFunction(b)?(c=b,b=void 0):b&&"object"==typeof b&&(e="POST"),g.length>0&&r.ajax({url:a,type:e||"GET",dataType:"html",data:b}).done(function(a){f=arguments,g.html(d?r("<div>").append(r.parseHTML(a)).find(d):a)}).always(c&&function(a,b){g.each(function(){c.apply(this,f||[a.responseText,b,a])})}),this},r.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(a,b){r.fn[b]=function(a){return this.on(b,a)}}),r.expr.pseudos.animated=function(a){return r.grep(r.timers,function(b){return a===b.elem}).length},r.offset={setOffset:function(a,b,c){var d,e,f,g,h,i,j,k=r.css(a,"position"),l=r(a),m={};"static"===k&&(a.style.position="relative"),h=l.offset(),f=r.css(a,"top"),i=r.css(a,"left"),j=("absolute"===k||"fixed"===k)&&(f+i).indexOf("auto")>-1,j?(d=l.position(),g=d.top,e=d.left):(g=parseFloat(f)||0,e=parseFloat(i)||0),r.isFunction(b)&&(b=b.call(a,c,r.extend({},h))),null!=b.top&&(m.top=b.top-h.top+g),null!=b.left&&(m.left=b.left-h.left+e),"using"in b?b.using.call(a,m):l.css(m)}},r.fn.extend({offset:function(a){if(arguments.length)return void 0===a?this:this.each(function(b){r.offset.setOffset(this,a,b)});var b,c,d,e,f=this[0];if(f)return f.getClientRects().length?(d=f.getBoundingClientRect(),b=f.ownerDocument,c=b.documentElement,e=b.defaultView,{top:d.top+e.pageYOffset-c.clientTop,left:d.left+e.pageXOffset-c.clientLeft}):{top:0,left:0}},position:function(){if(this[0]){var a,b,c=this[0],d={top:0,left:0};return"fixed"===r.css(c,"position")?b=c.getBoundingClientRect():(a=this.offsetParent(),b=this.offset(),B(a[0],"html")||(d=a.offset()),d={top:d.top+r.css(a[0],"borderTopWidth",!0),left:d.left+r.css(a[0],"borderLeftWidth",!0)}),{top:b.top-d.top-r.css(c,"marginTop",!0),left:b.left-d.left-r.css(c,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var a=this.offsetParent;while(a&&"static"===r.css(a,"position"))a=a.offsetParent;return a||ra})}}),r.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(a,b){var c="pageYOffset"===b;r.fn[a]=function(d){return T(this,function(a,d,e){var f;return r.isWindow(a)?f=a:9===a.nodeType&&(f=a.defaultView),void 0===e?f?f[b]:a[d]:void(f?f.scrollTo(c?f.pageXOffset:e,c?e:f.pageYOffset):a[d]=e)},a,d,arguments.length)}}),r.each(["top","left"],function(a,b){r.cssHooks[b]=Pa(o.pixelPosition,function(a,c){if(c)return c=Oa(a,b),Ma.test(c)?r(a).position()[b]+"px":c})}),r.each({Height:"height",Width:"width"},function(a,b){r.each({padding:"inner"+a,content:b,"":"outer"+a},function(c,d){r.fn[d]=function(e,f){var g=arguments.length&&(c||"boolean"!=typeof e),h=c||(e===!0||f===!0?"margin":"border");return T(this,function(b,c,e){var f;return r.isWindow(b)?0===d.indexOf("outer")?b["inner"+a]:b.document.documentElement["client"+a]:9===b.nodeType?(f=b.documentElement,Math.max(b.body["scroll"+a],f["scroll"+a],b.body["offset"+a],f["offset"+a],f["client"+a])):void 0===e?r.css(b,c,h):r.style(b,c,e,h)},b,g?e:void 0,g)}})}),r.fn.extend({bind:function(a,b,c){return this.on(a,null,b,c)},unbind:function(a,b){return this.off(a,null,b)},delegate:function(a,b,c,d){return this.on(b,a,c,d)},undelegate:function(a,b,c){return 1===arguments.length?this.off(a,"**"):this.off(b,a||"**",c)}}),r.holdReady=function(a){a?r.readyWait++:r.ready(!0)},r.isArray=Array.isArray,r.parseJSON=JSON.parse,r.nodeName=B,"function"==typeof define&&define.amd&&define("jquery",[],function(){return r});var Vb=a.jQuery,Wb=a.$;return r.noConflict=function(b){return a.$===r&&(a.$=Wb),b&&a.jQuery===r&&(a.jQuery=Vb),r},b||(a.jQuery=a.$=r),r});

},{}],13:[function(require,module,exports){
/**
 * Created by roper on 2017/6/22.
 */
var XTemplate = require('xtemplate');
var subjectSelectTemplate = new XTemplate($('#J_subject_select_tmp').html());

$(document).ready(function () {
    var html = subjectSelectTemplate.render({fullName: 'Roper'});
    $('.subject-select-container').html(html);
});
},{"xtemplate":6}]},{},[12,13]);
