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
/**
 * Created by roper on 2017/6/22.
 */
var XTemplate = require('xtemplate');

$(document).ready(function () {
    var subjectSelectTemplate = new XTemplate('J_subject_select_tmp');
    $('.subject-select-container').html(subjectSelectTemplate.render({
        id: 12,
        fullName: 'Roper'
    }));

});
},{"xtemplate":6}]},{},[12]);
