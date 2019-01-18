const EnvSection = require('./map/env'),
      ScriptSection = require('./map/script'),
      ObjectSection = require('./map/object'),
      TemplateSection = require('./map/template'),
      ViewSection = require('./map/view'),

      classList = {
        env: EnvSection,
        scripts: ScriptSection,
        objects: ObjectSection,
        templates: TemplateSection,
        views: ViewSection
      }

class Section {

  constructor(key, content) {
    return new classList[key](content)
  }

}

module.exports = Section
