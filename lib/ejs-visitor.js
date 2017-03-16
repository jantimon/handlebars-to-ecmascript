/* eslint-disable new-cap */
const Visitor = require('handlebars/dist/cjs/handlebars/compiler/visitor');
const esprima = require('esprima');

function toEcmaScript (ast, options) {
  return new EcmaScriptVisitor(options).accept(ast);
}

function concatExpressions (statements) {
  switch (statements.length) {
    case 0:
      return undefined;
    case 1:
      return statements[0];
  }
  const right = statements.pop();
  return {
    'type': 'BinaryExpression',
    'operator': '+',
    'left': concatExpressions(statements),
    'right': right
  };
}

function staticMemberExpression (members) {
  function createExpression (parts) {
    const identifier = parts.pop();
    return {
      type: 'MemberExpression',
      object: parts.length === 1
        ? { type: 'Identifier', name: parts[0] }
        : createExpression(parts),
      property: { type: 'Identifier', name: identifier }
    };
  }
  return createExpression(members.split('.'));
}

function createHelperImports (helpers) {
  return Object.keys(helpers)
    .filter((helperName) => helpers[helperName])
    .map((helperName) => ({
      'type': 'ImportDeclaration',
      'specifiers': [
        {
          'type': 'ImportSpecifier',
          'local': {
            'type': 'Identifier',
            'name': helperName
          },
          'imported': {
            'type': 'Identifier',
            'name': helperName
          }
        }
      ],
      'source': {
        'type': 'Literal',
        'value': helpers[helperName]
      }
    }));
}

class EcmaScriptVisitor extends Visitor {

  constructor (options) {
    super([arguments]);
    this._options = options || {};
    this._options.escapeFn = this._options.escapeFn || 'escape';
    this._options.export = this._options.export || false;
    this._options.helperResolver = this._options.helperResolver || (() => false);
  }

  _concatExpressions (statements) {
    return concatExpressions(statements.map((statement) => this.accept(statement)).filter((statement) => statement));
  }

  _getVariableName (offset) {
    return `data${this._depth + (offset || 0)}`;
  }

  _createRenderFunction (program, functionName) {
    this._depth++;
    const renderFunction = {
      'type': 'Program',
      'body': [
        {
          'type': 'FunctionDeclaration',
          'id': functionName === undefined ? null : {
            'type': 'Identifier',
            'name': functionName
          },
          'params': [{
            'type': 'Identifier',
            'name': this._getVariableName()
          }
          ],
          'body': {
            'type': 'BlockStatement',
            'body': [
              {
                'type': 'ReturnStatement',
                'argument': this._concatExpressions(program.body)
              }
            ]
          }
        }
      ]
    };
    this._depth--;
    return renderFunction;
  }

  /**
   * Start point for parsing an entire handlebars program
   */
  Program (program) {
    this._depth = 0;
    this._usedHelpers = {};
    const jsProgram = this._createRenderFunction(program, 'render');

    if (this._options.export) {
      const lastEntry = jsProgram.body.length - 1;
      jsProgram.body[lastEntry] = {
        'type': 'ExportNamedDeclaration',
        'declaration': jsProgram.body[lastEntry]
      };
    }

    jsProgram.body = createHelperImports(this._usedHelpers).concat(jsProgram.body);

    return jsProgram;
  }

  /**
   * {{world}}
   * {{world x=1}}
   */
  MustacheStatement (mustache) {
    if (mustache.hash) {
      return this.BlockStatement(mustache);
    }
    return {
      'type': 'CallExpression',
      'callee': {
        'type': 'Identifier',
        'name': mustache.escaped ? this._options.escapeFn : 'String'
      },
      'arguments': [staticMemberExpression(this._getVariableName(-mustache.path.depth) + '.' + mustache.path.parts[0])]
    };
  }

  Decorator (mustache) {
    return '{{ DIRECTIVE ' + this.SubExpression(mustache) + ' }}';
  }

  /**
   * {{#if x}}world{{/if}}
   * https://handlebarsjs.com/builtin_helpers.html#conditionals
   */
  IfStatement (ifBlock) {
    const condition = ifBlock.params[0].original;
    const parsedCondition = staticMemberExpression(this._getVariableName() + '.' + condition);
    return {
      'type': 'ConditionalExpression',
      'test': parsedCondition,
      'consequent': this._concatExpressions(ifBlock.program.body),
      'alternate': ifBlock.inverse ? this._concatExpressions(ifBlock.inverse.body) : {
        'type': 'Literal',
        'value': '',
        'raw': "''"
      }
    };
  }

  /**
   * {{#unless x}}world{{/unless}}
   * https://handlebarsjs.com/builtin_helpers.html#unless
   */
  UnlessStatement (unlessBlock) {
    const condition = unlessBlock.params[0].original;
    const parsedCondition = staticMemberExpression(this._getVariableName() + '.' + condition);
    return {
      'type': 'ConditionalExpression',
      'test': parsedCondition,
      'consequent': unlessBlock.inverse ? this._concatExpressions(unlessBlock.inverse.body) : {
        'type': 'Literal',
        'value': '',
        'raw': "''"
      },
      'alternate': this._concatExpressions(unlessBlock.program.body)
    };
  }

  /**
   * Pure content like a string
   */
  ContentStatement (content) {
    return {
      'type': 'Literal',
      'value': content.value
    };
  }

  /**
   * {{! a comment}}
   */
  CommentStatement (comment) {
    return undefined;
  }

  /**
   * {{#blockStart}}{{/blockEnd}}
   */
  BlockStatement (block) {
    const helperName = block.path.parts[0];

    if (!this._usedHelpers[helperName]) {
      this._usedHelpers[helperName] = this._options.helperResolver(helperName);
    }

    switch (helperName) {
      case 'if': return this.IfStatement(block);
      case 'unless': return this.UnlessStatement(block);
    }

    const options = {
      'type': 'ObjectExpression',
      'properties': []
    };
    if (block.hash && block.hash.pairs) {
      block.hash.pairs.forEach((pair) => {
        if (pair.value.type === 'PathExpression') {
          options.properties.push({
            'type': 'Property',
            'key': {
              'type': 'Identifier',
              'name': pair.key
            },
            'value': staticMemberExpression(this._getVariableName() + '.' + pair.value.original)
          });
        } else {
          options.properties.push({
            'type': 'Property',
            'key': {
              'type': 'Identifier',
              'name': pair.key
            },
            'value': {
              'type': 'Literal',
              'value': pair.value.value,
              'raw': JSON.stringify(pair.value.value)
            }
          });
        }
      });
    }
    const functionCall = esprima.parse(`${helperName}()`).body[0].expression;
    functionCall.arguments = [ options ];
    if (block.program && block.program.body.length) {
      functionCall.arguments.push({
        'type': 'ObjectExpression',
        'properties': [{
          'type': 'Property',
          'key': {
            'type': 'Identifier',
            'name': 'fn'
          },
          'value': this._createRenderFunction(block.program)
        }]
      });
    }
    return functionCall;
  }

  DecoratorBlock (block) {
    console.warn('DecoratorBlock is not implemented yet');
    return undefined;
  }

  PartialStatement (partial) {
    console.warn('PartialStatement is not implemented yet');
    return undefined;
  }

  PartialBlockStatement (partial) {
    console.warn('PartialBlockStatement is not implemented yet');
    return undefined;
  }

  SubExpression (sexpr) {
    console.warn('SubExpression is not implemented yet');
    return undefined;
  }

  PathExpression (id) {
    console.warn('PathExpression is not implemented yet');
    return undefined;
  }

  StringLiteral (string) {
    return '"' + string.value + '"';
  }

  NumberLiteral (number) {
    return 'NUMBER{' + number.value + '}';
  }

  BooleanLiteral (bool) {
    return 'BOOLEAN{' + bool.value + '}';
  }

  UndefinedLiteral () {
    return 'UNDEFINED';
  }

  NullLiteral () {
    return 'NULL';
  }

  Hash (hash) {
    let pairs = hash.pairs;
    let joinedPairs = [];

    for (let i = 0, l = pairs.length; i < l; i++) {
      joinedPairs.push(this.accept(pairs[i]));
    }

    return 'HASH{' + joinedPairs.join(', ') + '}';
  }

  HashPair (pair) {
    return pair.key + '=' + this.accept(pair.value);
  }

}

module.exports = {
  toEcmaScript: toEcmaScript,
  EcmaScriptVisitor: EcmaScriptVisitor
};
