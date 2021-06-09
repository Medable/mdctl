const { existsSync, writeFileSync, mkdirSync } = require('fs'),
      { execSync } = require('child_process'),
      {
        rString
      } = require('@medable/mdctl-core-utils/values'),
      Task = require('../lib/task'),
      {
        initProjectQuestions
      } = require('../lib/questionnaires'),
      defaultPackage = require('../extras/templates/default/package.json')

class Init extends Task {

  static get taskNames() {

    return ['init']

  }

  async run() {

    const options = {
      prefix: rString(this.args('prefix'))
    }

    const defaultPath = options.prefix || '.'

    const isDirectoryPresent = existsSync(`${defaultPath}`)

    if (!isDirectoryPresent) {
      mkdirSync(defaultPath, { recursive: true })
    }

    const isManifest = existsSync(`${defaultPath}`) && existsSync(`${defaultPath}/manifest.json`)

    if (isManifest) {
      throw new Error(`Project already initialized in the current directory (${defaultPath})`)
    }

    const responses = await initProjectQuestions(options)

    const updatedPackage = {
      ...defaultPackage,
      ...responses
    }

    execSync(`cp -R ${__dirname}/../extras/templates/default/ ${defaultPath}`)

    writeFileSync(`${defaultPath}/package.json`, JSON.stringify(updatedPackage, null, ' '))

  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'creates folder structure'
  }

  static help() {

    return `    
    Creates folder structure for a new project
    
    Usage: 
      
      mdctl init      
          
    Arguments:                                             
                
      Options 
                                                                        
        --prefix - path to directory where to start the project
    `
  }

}

module.exports = Init