const Fs = require('fs')
const Path = require('path')
const Handlebars = require('handlebars'),

      PARTIALS = Object.freeze([
        'gitbook/route',
        'gitbook/nav-item',
        'gitbook/tab',
        'md/app',
        'md/function',
        'md/key-value',
        'md/list',
        'md/object',
        'md/value',
      ]),

      TEMPLATES = Object.freeze({
        GITBOOK: {
          INTRODUCTION: Handlebars.compile(load('gitbook/introduction')),
          MODULE: Handlebars.compile(load('gitbook/module')),
          SUMMARY: Handlebars.compile(load('gitbook/summary')),
        },
        MD: {
          APPS: Handlebars.compile(load('md/apps')),
        }
      })

function load(component) {
  return Fs.readFileSync(Path.join(__dirname, 'components', `${component}.hbs`), 'utf8')
}

/**
 * TODO: Improve REGEX
 *   This REGEX is sloppy and needs to more closely represent markdown formatting.
 *   It should consider space around the characters, formatting pairs (open/close),
 *   already escaped, etc
 */
Handlebars.registerHelper('escape_md', s => (typeof s === 'string' ? s.replace(/(\\|\*|_|`|{|}|\(|\)|\[|\]|#)/g, '\\$1') : s))

Handlebars.registerHelper('cammel_to_sentence', s => (typeof s === 'string' ? s.replace(/([A-Z])/g, match => ` ${match}`).replace(/^./, match => match.toUpperCase()) : s))

PARTIALS.forEach(partial => Handlebars.registerPartial(partial.replace(/\//g, '.'), load(partial)))

module.exports = {
  TEMPLATES,
}
