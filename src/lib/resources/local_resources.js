const fs = require('fs'),
      jsYaml = require('js-yaml'),
      Fault = require('../fault')

class LocalResources {

  constructor(output = `${process.cwd()}/output`) {
    if (!fs.existsSync(output)) {
      throw new Fault('kFolderNotFound', 'Environment folder not found', 404)
    }
    this.output = output
  }

  loadResource(type) {
    const jsonData = fs.readFileSync(`${__dirname}/templates/${type}.json`)
    return JSON.stringify(JSON.parse(jsonData))
  }

  create(typeResource, args) {
    const data = this.loadResource(typeResource)
    switch (typeResource) {
      case 'script':
        return this.createScript(data, args)
      case 'template':
        return this.createTemplate(data, args)
      case 'view':
        return this.createView(data, args)
      case 'object':
        return this.createObject(data, args)
      default:
        throw new Fault('kTypeNotFound', 'Type of resource not found', 404)
    }
  }

  createObject(data, args) {
    console.log('object')
  }

  createView(data, args) {
    console.log('view')
  }

  createTemplate(data, args) {
    const {
      code, type, format = 'json', output = this.output
    } = args

  }


  createScript(data, args) {
    const {
      code, type, format = 'json', output = this.output
    } = args
    let content = data.replace(/#CODE#/ig, code)
    content = content.replace(/#LABEL#/ig, code.toUpperCase())
    content = content.replace(/#TYPE#/ig, type)
    content = content.replace(/#PATH_FILE#/ig, `scripts/js/${code}.js`)

    const outputData = format === 'json' ? content : jsYaml.safeDump(JSON.parse(content))
    fs.writeFileSync(`${output}/scripts/${type}/${code}.${format}`, outputData)
    fs.writeFileSync(`${output}/scripts/js/${code}_${type}.js`, "return 'template';")
  }

}

module.exports = LocalResources
