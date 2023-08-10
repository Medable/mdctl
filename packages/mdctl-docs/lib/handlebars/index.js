const fs = require('fs'),
      path = require('path'),
      handlebars = require('handlebars'),
      util = require('../util'),
      PARTIALS = fs.readdirSync(path.join(__dirname, 'components'))
        .filter(file => file.endsWith('.hbs'))
        .map(file => ({
          compile: handlebars.compile(util.read(path.join(__dirname, 'components', file))),
          file: util.read(path.join(__dirname, 'components', file)),
          name: util.removeExtention(file)
        })),
      TEMPLATE_OBJ_OPTS = Object.freeze({
        key: 'name',
        keyTransform: key => util.capitalize(key).replace(/[.]|-/g, '_'),
        valueTransform: value => value.compile
      }),
      TEMPLATES = util.array2Obj(PARTIALS, TEMPLATE_OBJ_OPTS)

function loadPartials(partials = []) {
  partials.forEach(partial => handlebars.registerPartial(partial.name, partial.file))
  // returns new TEMPLATES object containing additional compiled partials
  return Object.assign({}, TEMPLATES, util.array2Obj(partials, TEMPLATE_OBJ_OPTS))
}

handlebars.registerHelper('cammel_to_sentence', util.cammelToSentence)

/**
 * TODO: Improve REGEX
 *   This REGEX is sloppy and needs to more closely represent markdown formatting.
 *   It should consider space around the characters, formatting pairs (open/close),
 *   already escaped, etc
 */
handlebars.registerHelper('md_escape', s => (typeof s === 'string' ? s.replace(/(\\|\*|_|`|{|}|\(|\)|\[|\]|#)/g, '\\$1') : s))

handlebars.registerHelper('md_header', (s, level = 1) => (typeof s === 'string' ? `${'#'.repeat(level)} ${s}` : s))

handlebars.registerHelper('delta', (n = 0, delta = 1) => n + delta)

handlebars.registerHelper('or', (...args) => {
  args.pop()
  return args.reduce((bool, arg) => bool || arg, false)
})

handlebars.registerHelper('capitalize', util.capitalize)

handlebars.registerHelper('capitalize_first', util.capitalizeFirstCharacter)

handlebars.registerHelper('stringify', util.stringify)

handlebars.registerHelper('equals', (...args) => {
  args.pop()
  return args.every((arg => args[0] === arg))
})

loadPartials(PARTIALS)

module.exports = {
  loadPartials,
  TEMPLATES,
}
