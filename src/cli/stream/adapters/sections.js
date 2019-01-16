const fs = require('fs')

class Section {

  constructor(blob, options) {
    this.blob = blob
    this.options = options
    this.paths = []
  }

  ensure(path) {
    !fs.existsSync(path) && fs.mkdirSync(path, { recursive: true })
  }

  getPaths() {
    return this.paths
  }

  createPaths() {
    const paths = this.getPaths()
    paths.forEach((p) => {
      this.ensure(p)
    })
  }

  async save(name, content) {
    return new Promise((resolve, reject) => {
      fs.writeFile(name, content, (err) => {
        if (err) {
          return reject(err)
        }
        return resolve()
      })
    })
  }

}

class EnvSection extends Section {

  getPaths() {
    return [`${this.options.outputDir}`]
  }

  async save(format, parserClass) {
    this.createPaths()
    await super.save(`${this.getPaths()[0]}/env.${format}`, parserClass.stringify(this.blob))
  }
}

class ObjectSection extends Section {

  getPaths() {
    return [
      `${this.options.outputDir}/objects`
    ]
  }

  async save(format, parserClass) {
    this.createPaths()
    // Process scripts
    const promises = []
    for (const obj of this.blob) {
      promises.push(super.save(`${this.getPaths()[0]}/${obj.name}.${format}`, parserClass.stringify(obj)))
    }
    await Promise.all(promises)
  }

}

class ScriptSection extends Section {

  constructor(blob, options) {
    super(blob, options)
    this.jsPath = `${this.options.outputDir}/scripts/js`
    this.mainPath = `${this.options.outputDir}/scripts`
  }

  getPaths() {
    return [
      this.mainPath,
      `${this.mainPath}/library`,
      `${this.mainPath}/job`,
      `${this.mainPath}/route`,
      `${this.mainPath}/trigger`,
      this.jsPath
    ]
  }

  async save(format, parserClass) {
    this.createPaths()
    // Process scripts
    const promises = []
    for (const script of this.blob) {
      const scriptJS = script.script,
            name = script.name || script.code || script.label,
            fileJs = `${this.jsPath}/${name}.js`
      promises.push(super.save(fileJs, scriptJS))
      script.script = fileJs.replace(`${this.options.outputDir}/`, '')
      promises.push(super.save(`${this.getPaths()[0]}/${script.type}/${name}.${format}`, parserClass.stringify(script)))
    }

    await Promise.all(promises)
  }

}

class TemplateSection extends Section {

  getPaths() {
    return [
      `${this.options.outputDir}/templates`
    ]
  }

  async save(format, parserClass) {
    this.createPaths()
    // Process scripts
    const promises = []
    for (const template of this.blob) {
      promises.push(super.save(
        `${this.getPaths()[0]}/${template.type}_${template.name}.${format}`,
        parserClass.stringify(template)
      ))
    }
    await Promise.all(promises)
  }

}

class ViewSection extends Section {

  getPaths() {
    return [
      `${this.options.outputDir}/views`
    ]
  }

  async save(format, parserClass) {
    this.createPaths()
    // Process scripts
    const promises = []
    for (const view of this.blob) {
      promises.push(super.save(
        `${this.getPaths()[0]}/${view.name}.${format}`,
        parserClass.stringify(view)
      ))
    }
    await Promise.all(promises)
  }

}

class SectionFactory {

  static getSection(key, blob, options) {
    const sections = {
      env: EnvSection,
      objects: ObjectSection,
      scripts: ScriptSection,
      templates: TemplateSection,
      views: ViewSection
    }

    return new sections[key](blob, options)
  }

}

module.exports = SectionFactory
