const Fs = require('fs')
const Path = require('path')
const Handlebars = require('handlebars'),

      TEMPLATES = Object.freeze({
        MODULE: 'MODULE'
      }),

      PARTIALS = Object.freeze([
        'function',
        'object',
        'route',
        'tab',
        'value',
      ]),

      COMPILED_TEMPLATES = Object.freeze({
        [TEMPLATES.MODULE]: Handlebars.compile(load('module')),
      })

function load(name) {
  return Fs.readFileSync(Path.join(__dirname, 'partials', `${name}.hbs`), 'utf8')
}

function register(names) {
  for (let i = 0; i < names.length; i += 1) {
    Handlebars.registerPartial(names[i], load(names[i]))
  }
}

function compile(template, data) {
  return COMPILED_TEMPLATES[template](data)
}

/**
 * TODO: Improve REGEX
 *   This REGEX is sloppy and needs to more closely represent markdown formatting.
 *   It should consider space around the characters, formatting pairs (open/close),
 *   already escaped, etc
 */
Handlebars.registerHelper('escape_md', s => (typeof s === 'string' ? s.replace(/(\\|\*|_|`|{|}|\(|\)|\[|\]|#)/g, '\\$1') : s))

register(PARTIALS)

module.exports = {
  compile,
  TEMPLATES,
}
