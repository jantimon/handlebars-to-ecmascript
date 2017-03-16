const Handlebars = require('handlebars');
const toEcmaScript = require('./lib/ejs-visitor').toEcmaScript;

const escodegen = require('escodegen');

function toJsCode (hbsCode, options) {
  return escodegen.generate(getJsAst(hbsCode, options));
}

function getJsAst (hbsCode, options) {
  const hbsAst = Handlebars.parse(hbsCode);
  return toEcmaScript(hbsAst, options);
}

module.exports = {
  toJsCode,
  getJsAst,
  toEcmaScript
};
