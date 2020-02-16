const Fs = require('fs')
const Path = require('path')
const Handlebars = require('handlebars'),

      PARTIALS = Object.freeze([
        'gitbook/nav-item',
        'gitbook/tab',
        'md/function',
        'md/key-value',
        'md/resource',
        'md/route',
        'md/set',
        'md/object',
        'md/value'
      ]),

      TEMPLATES = Object.freeze({
        GITBOOK: {
          README: Handlebars.compile(load('gitbook/readme')),
          MODULE: Handlebars.compile(load('gitbook/module')),
          SUMMARY: Handlebars.compile(load('gitbook/summary'))
        },
        MD: {
          RESOURCE: Handlebars.compile(load('md/resource'))
        }
      })

function load(component) {
  return Fs.readFileSync(Path.join(__dirname, 'components', `${component}.hbs`), 'utf8')
}

Handlebars.registerHelper('cammel_to_sentence', s => (typeof s === 'string' ? s.replace(/([A-Z])/g, match => ` ${match}`).replace(/^./, match => match.toUpperCase()) : s))

/**
 * TODO: Improve REGEX
 *   This REGEX is sloppy and needs to more closely represent markdown formatting.
 *   It should consider space around the characters, formatting pairs (open/close),
 *   already escaped, etc
 */
Handlebars.registerHelper('md_escape', s => (typeof s === 'string' ? s.replace(/(\\|\*|_|`|{|}|\(|\)|\[|\]|#)/g, '\\$1') : s))

Handlebars.registerHelper('md_header', (s, level=1) => (typeof s === 'string' ? `${'#'.repeat(level)} ${s}` : s))

Handlebars.registerHelper('next_n', (n=0) => n + 1)

Handlebars.registerHelper('uppercase', s => (typeof s === 'string' ? s.toUpperCase() : s))

PARTIALS.forEach(partial => Handlebars.registerPartial(partial.replace(/\//g, '.'), load(partial)))

module.exports = {
  TEMPLATES,
}
