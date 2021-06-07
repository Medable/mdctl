const fs = require('fs'),
      {
        rString
      } = require('@medable/mdctl-core-utils/values'),
      Task = require('../lib/task'),
      defaultTpl = require('../extras/templates/default.json')

class Init extends Task {

  static get taskNames() {

    return ['init']

  }

  createFiles(parent = '.', files = []) {

    files.forEach(({ type, name, content }) => {

      if(!type) return

      if(!name) return

      if (!content || content.length === 0) return

      const path = `${parent}/${name}`

      if (type === 'dir') {

        if (!fs.existsSync(path)) {

          fs.mkdirSync(path)

          this.createFiles(path, content || [])

        }

      } else if (type === 'file') {

        fs.writeFileSync(path, content.trim(), 'UTF-8')

      }

    })

  }

  async run() {

    const { files } = defaultTpl

    const defaultPath = rString(this.args('prefix')) || '.'

    const isDirectoryPresent = fs.existsSync(`${defaultPath}`)

    if (!isDirectoryPresent) {
      fs.mkdirSync(defaultPath, { recursive: true })
    }

    const isManifest = fs.existsSync(`${defaultPath}`) && fs.existsSync(`${defaultPath}/manifest.json`)

    if (isManifest) {
      throw new Error(`Project already initialized in the current directory (${defaultPath})`)
    }

    return this.createFiles(defaultPath, files)

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