const Fs = require('fs'),
      Path = require('path'),
      Handlebars = require('handlebars'),
      Util = require('../util'),
      partials = Fs.readdirSync(Path.join(__dirname, 'components'))
        .filter(file => file.endsWith('.hbs'))
        .map(file => ({
          compile: Handlebars.compile(Util.read(Path.join(__dirname, 'components', file))),
          file: Util.read(Path.join(__dirname, 'components', file)),
          name: Util.removeExtention(file)
        })),
      TEMPLATE_OBJ_OPTS = Object.freeze({
        key: 'name',
        keyTransform: key => Util.capitalize(key).replace(/[.]|-/g, '_'),
        valueTransform: value => value.compile
      }),
      TEMPLATES = Util.array2Obj(partials, TEMPLATE_OBJ_OPTS)

function loadPartials(partials=[]) {
  partials.forEach(partial => Handlebars.registerPartial(partial.name, partial.file))
  // returns new TEMPLATES object containing additional compiled partials
  return Object.assign({}, TEMPLATES, Util.array2Obj(partials, TEMPLATE_OBJ_OPTS))
}

Handlebars.registerHelper('cammel_to_sentence', s => (typeof s === 'string' ? s.replace(/([A-Z])/g, match => ` ${match}`).replace(/^./, match => match.toUpperCase()) : s))

/**
 * TODO: Improve REGEX
 *   This REGEX is sloppy and needs to more closely represent markdown formatting.
 *   It should consider space around the characters, formatting pairs (open/close),
 *   already escaped, etc
 */
Handlebars.registerHelper('md_escape', s => (typeof s === 'string' ? s.replace(/(\\|\*|_|`|{|}|\(|\)|\[|\]|#)/g, '\\$1') : s))

Handlebars.registerHelper('md_header', (s, level = 1) => (typeof s === 'string' ? `${'#'.repeat(level)} ${s}` : s))

Handlebars.registerHelper('next_n', (n = 0) => n + 1)

Handlebars.registerHelper('capitalize', Util.capitalize)

loadPartials(partials)

module.exports = {
  loadPartials,
  TEMPLATES,
}
