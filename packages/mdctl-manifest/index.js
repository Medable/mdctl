const { templates } = require('@medable/mdctl-core-schemas'),
      fs = require('fs'),
      { isSet, parseString } = require('@medable/mdctl-core-utils/values'),
      { Manifest } = require('@medable/mdctl-core'),

      add = async(input) => {
        const options = isSet(input) ? input : {},
              template = await templates.create(options.object, options.type, options.name),
              outputDir = options.dir || process.cwd(),
              manifestFile = options.manifest || `${outputDir}/manifest.${options.format || 'json'}`

        let manifest = {}
        if (fs.existsSync(manifestFile)) {
          manifest = parseString(fs.readFileSync(manifestFile), options.format || 'json')
        }

        return new Manifest(manifest).addResource(
          template.object,
          template.exportKey,
          template,
          options
        )
      }

module.exports = {
  add
}
