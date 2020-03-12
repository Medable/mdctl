const Fs = require('fs')
const Path = require('path')
const Handlebars = require('handlebars')
const Util = require('../util')

const TEMPLATES = Object.freeze({
  MODULE: 'MODULE'
})

const PARTIALS = Object.freeze([
  'example',
  'function',
  'object',
  'route',
  'tab',
  'value',
])

function load(name){
  return Fs.readFileSync(Path.join(__dirname, 'partials', `${name}.hbs`), 'utf8')
}

function register(names){
  for(let i = 0; i < names.length; i++){
    Handlebars.registerPartial(names[i], load(names[i]))
  }
}

function compile(template, data){
  return COMPILED_TEMPLATES[template](data)
}

Handlebars.registerHelper('escape_md', function (s) {
  /**
   * TODO: Improve REGEX
   *   This REGEX is sloppy and needs to more closely represent markdown formatting.
   *   It should consider space around the characters, formatting pairs (open/close), already escaped, etc
   */
  return typeof s === 'string' ? s.replace(/(\\|\*|_|`|{|}|\(|\)|\[|\]|#)/g, '\\$1') : s
})

register(PARTIALS)

const COMPILED_TEMPLATES = Object.freeze({
  [TEMPLATES.MODULE]: Handlebars.compile(load('module')),
})

module.exports = {
  compile,
  TEMPLATES,
}