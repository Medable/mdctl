const fs = require('fs'),
      jsYaml = require('js-yaml'),
      Fault = require('../fault')

class LocalResources {

  loadResource(type) {
    const jsonData = fs.readFileSync(`${__dirname}/templates/${type}.json`)
    return JSON.stringify(JSON.parse(jsonData))
  }

  create(typeResource, args) {
    const data = this.loadResource(typeResource)
    const output = args.output || `${process.cwd()}/output`
    if (!fs.existsSync(output)) {
      throw new Fault('kFolderNotFound', 'Environment folder not found', 404)
    }

    switch (typeResource) {
      case 'script':
        return this.createScript(data, args, output)
      case 'template':
        return this.createTemplate(data, args, output)
      case 'view':
        return this.createView(data, args, output)
      case 'object':
        return this.createObject(data, args, output)
      default:
        throw new Fault('kTypeNotFound', 'Type of resource not found', 404)
    }
  }

  createObject(data, args, output) {
    console.log('object')
  }

  createView(data, args, output) {
    console.log('view')
  }

  createTemplate(data, args, outoput) {
    const {
      code, type, format = 'json'
    } = args

  }


  createScript(data, args, output) {
    const {
      code, type, format = 'json'
    } = args
    let content = data.replace(/#CODE#/ig, code)
    content = content.replace(/#LABEL#/ig, code.toUpperCase())
    content = content.replace(/#TYPE#/ig, type)
    content = content.replace(/#PATH_FILE#/ig, `scripts/js/${code}.js`)

    const outputData = format === 'json' ? content : jsYaml.safeDump(JSON.parse(content))
    fs.writeFileSync(`${output}/scripts/${type}/${code}.${format}`, outputData)
    fs.writeFileSync(`${output}/scripts/js/${code}_${type}.js`, "return 'foo';")
  }

}

module.exports = LocalResources
