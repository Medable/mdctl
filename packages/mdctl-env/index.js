const { templates } = require('mdctl-core-schemas'),
      ExportEnv = require('export'),
      ImportEnv = require('import')

const add = async(input) => {
  const options = isSet(input) ? input : {},
    template = await templates.create(options.object, options.type, options.name),
    outputDir = options.dir || process.cwd,
    manifestFile = options.manifest || `${outputDir}/manifest.${options.format || 'json'}`

  let manifest = {}
  if (fs.existsSync(manifestFile)) {
    manifest = parseString(fs.readFileSync(manifestFile), options.format || 'json')
  }

  await new Manifest(manifest).addResource(template.object, template.exportKey, template, options)
}

module.exports = {
  add,
  export: ExportEnv,
  import: ImportEnv
}