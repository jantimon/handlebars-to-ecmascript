/* global describe, it, before, after */
var assert = require('chai').assert;
var astEqual = require('esprima-ast-equality');
var toJsCode = require('../').toJsCode;

describe('hbs to js', function () {
  it('should compile a simple string concatination', function () {
    astEqual(toJsCode('Hello {{{world}}}'), (
      function render (data1) {
        return 'Hello ' + String(data1.world);
      }
    ).toString());
  });

  it('should compile a string concatination', function () {
    astEqual(toJsCode('Hello {{world}}'), (
      function render (data1) {
        return 'Hello ' + escape(data1.world);
      }
    ).toString());
  });

  it('should compile a wrapping concatination', function () {
    astEqual(toJsCode('Hello {{{world}}}.'), (
      function render (data1) {
        return 'Hello ' + String(data1.world) + '.';
      }
    ).toString());
  });

  it('should convert a variable to string', function () {
    astEqual(toJsCode('{{{world}}}'), (
      function render (data1) {
        return String(data1.world);
      }
    ).toString());
  });

  it('should compile a helper call', function () {
    astEqual(toJsCode('Hello {{#helper}}{{/helper}}'), (
      function render (data1) {
        return 'Hello ' + helper({});
      }
    ).toString());
  });

  it('should compile a helper call with arguments', function () {
    astEqual(toJsCode('Hello {{#helper x=1}}{{/helper}}'), (
      function render (data1) {
        return 'Hello ' + helper({x: 1 });
      }
    ).toString());
  });

  it('should compile a helper call with arguments', function () {
    astEqual(toJsCode('Hello {{helper x=1}}'), (
      function render (data1) {
        return 'Hello ' + helper({x: 1 });
      }
    ).toString());
  });

  it('should compile a helper call with multiple arguments', function () {
    astEqual(toJsCode('Hello {{helper x=1 y="a" z=null}}'), (
      function render (data1) {
        return 'Hello ' + helper({x: 1, y: 'a', z: null });
      }
    ).toString());
  });

  it('should compile a helper call with variable arguments', function () {
    astEqual(toJsCode('Hello {{helper x=world}}'), (
      function render (data1) {
        return 'Hello ' + helper({ x: data1.world });
      }
    ).toString());
  });

  it('should compile a helper call with variable child arguments', function () {
    astEqual(toJsCode('Hello {{helper x=world.name}}'), (
      function render (data1) {
        return 'Hello ' + helper({ x: data1.world.name });
      }
    ).toString());
  });

  it('should compile a helper call with children', function () {
    astEqual(toJsCode('Hello {{#helper}}world{{/helper}}'), (
      function render (data1) {
        return 'Hello ' + helper({}, {
          fn: function (data2) { return 'world'; }
        });
      }
    ).toString());
  });

  it('should compile a nested helper call with children', function () {
    astEqual(toJsCode('Hello {{#helper}}world{{#helper}} from {{{world}}}{{/helper}}{{/helper}}'), (
      function render (data1) {
        return 'Hello ' + helper({}, {
          fn: function (data2) {
            return 'world' + helper({}, {
              fn: function (data3) {
                return ' from ' + String(data3.world);
              }
            });
          }
        });
      }
    ).toString());
  });

  it('should compile a nested helper call with children scope', function () {
    astEqual(toJsCode('Hello {{#helper}}world{{#helper}} from {{{../../world}}}{{/helper}}{{/helper}}'), (
      function render (data1) {
        return 'Hello ' + helper({}, {
          fn: function (data2) {
            return 'world' + helper({}, {
              fn: function (data3) {
                return ' from ' + String(data1.world);
              }
            });
          }
        });
      }
    ).toString());
  });

  it('should compile a helper call amd add import statements', function () {
    const helperMap = { helper: 'demo/helper' };
    const code = toJsCode('Hello {{helper x=world}}', { export: true, helperResolver: (helperName) => helperMap[helperName]});
    assert.equal(code, `import { helper } from 'demo/helper';
export function render(data1) {
    return 'Hello ' + helper({ x: data1.world });
}`);
  });

  it('should compile a unless call', function () {
    astEqual(toJsCode('Hello {{#unless online}}world{{/unless}}'), (
      function render (data1) {
        return 'Hello ' + (data1.online ? '' : 'world');
      }
    ).toString());
  });

  it('should compile a unless/else call', function () {
    astEqual(toJsCode('Hello {{#unless online}}world{{else}}mars{{/unless}}'), (
      function render (data1) {
        return 'Hello ' + (data1.online ? 'mars' : 'world');
      }
    ).toString());
  });

  it('should compile a if call', function () {
    astEqual(toJsCode('Hello {{#if online}}world{{/if}}'), (
      function render (data1) {
        return 'Hello ' + (data1.online ? 'world' : '');
      }
    ).toString());
  });

  it('should compile a if/else call', function () {
    astEqual(toJsCode('Hello {{#if online}}world{{else}}moon{{/if}}'), (
      function render (data1) {
        return 'Hello ' + (data1.online ? 'world' : 'moon');
      }
    ).toString());
  });

  it('should compile a if/else if call', function () {
    astEqual(toJsCode('Hello {{#if online}}world{{else if offline}}moon{{/if}}'), (
      function render (data1) {
        return 'Hello ' + (data1.online ? 'world' : (data1.offline ? 'moon' : ''));
      }
    ).toString());
  });

  it('should compile a if/else if else call', function () {
    astEqual(toJsCode('Hello {{#if online}}world{{else if offline}}moon{{else}}mars{{/if}}'), (
      function render (data1) {
        return 'Hello ' + (data1.online ? 'world' : (data1.offline ? 'moon' : 'mars'));
      }
    ).toString());
  });

  it('should strip a comment', function () {
    astEqual(toJsCode('Hello {{! world }}'), (
      function render (data1) {
        return 'Hello ';
      }
    ).toString());
  });
});

describe('render tests', function () {
  it('should render a string concatination', function () {
    var template;
    eval('template = ' + toJsCode('Hello {{{world}}}'));
    assert.equal(template({ world: 'mars' }), 'Hello mars');
  });

  it('should render a undefined if', function () {
    var template;
    eval('template = ' + toJsCode('Hello {{#if world}}{{{world}}}{{/if}}'));
    assert.equal(template({ }), 'Hello ');
  });

  it('should render a null if', function () {
    var template;
    eval('template = ' + toJsCode('Hello {{#if world}}{{{world}}}.{{/if}}'));
    assert.equal(template({ world: null }), 'Hello ');
  });

  it('should render a false if', function () {
    var template;
    eval('template = ' + toJsCode('Hello {{#if world}}{{{world}}}.{{/if}}'));
    assert.equal(template({ world: false }), 'Hello ');
  });

  it('should render a empty string if', function () {
    var template;
    eval('template = ' + toJsCode('Hello {{#if world}}{{{world}}}.{{/if}}'));
    assert.equal(template({ world: '' }), 'Hello ');
  });

  it('should render a zero if', function () {
    var template;
    eval('template = ' + toJsCode('Hello {{#if world}}{{{world}}}.{{/if}}'));
    assert.equal(template({ world: 0 }), 'Hello ');
  });
});
