const Path = require('path')
const {
  compile,
  TEMPLATES,
} = require('../../../handlebars')
const Util = require('../../../util')

function filterDoclets(taffyDb) {
  // documented, non-package
  return taffyDb({
    kind: {
      '!is': 'package'
    },
    undocumented: {
      isUndefined: true
    }
  }).get()
}

function loadEnvData(manifest, home, type){
  return manifest[type] && manifest[type].includes.map(name => Util.readJsonFile(Path.join(home, 'env', type, `${name}.json`)))
}

function loadEnvObjects(manifest, home){
  return manifest.objects && manifest.objects.map(obj => Util.readJsonFile(Path.join(home, 'env', 'objects', `${obj.name}.json`)))
}

function extract(manifest, home){
  return {
    apps: loadEnvData(manifest, home, 'apps'),
    notifications: loadEnvData(manifest, home, 'notifications'),
    roles: loadEnvData(manifest, home, 'roles'),
    serviceAccounts: loadEnvData(manifest, home, 'serviceAccounts'),
    policies: loadEnvData(manifest, home, 'policies'),
    objects: loadEnvObjects(manifest, home),
    scripts: loadEnvData(manifest, home, 'scripts'),
  }
}

function buildSummary(data){
  const contents = [
    {
      name: 'Introduction',
      uri: 'README.md'
    }
  ]

  if(data.apps){
    contents.push({
      name: 'Apps',
      uri: 'env/apps.md'
    })
  }

  if(data.notifications){
    contents.push({
      name: 'Notifications',
      uri: 'env/notifications.md'
    }) 
  }

  if(data.roles){
    contents.push({
      name: 'Roles',
      uri: 'env/roles.md'
    }) 
  }

  if(data.serviceAccounts){
    contents.push({
      name: 'Service Accounts',
      uri: 'env/serviceAccounts.md'
    }) 
  }

  if(data.policies){
    contents.push({
      name: 'Policies',
      uri: 'env/policies.md'
    }) 
  }

  if(data.runtime){
    contents.push({
      name: 'Runtime',
      uri: 'env/runtime.md'
    }) 
  }

  return TEMPLATES.GITBOOK.SUMMARY({
    contents,
    // objects: [],
    // scripts: {
    //   routes: [],
    //   policies: [],
    //   libraries: [],
    //   jobs: [],
    //   triggers: []
    // },
    // classes: [],
    // releaseNotes: []
  })
}

function buildResources(name, resources){
  return TEMPLATES.MD.RESOURCES({
    name,
    resources: resources.map(Util.breakdownJSON)
  })
}

function assembleFiles(doclets, source) {

  const home = Path.resolve(process.cwd(), source),
        manifest = Util.readJsonFile(Path.join(home, 'manifest.json')),
        data = extract(manifest, home),
        files = []

  files.push({
    content: TEMPLATES.GITBOOK.INTRODUCTION({}),
    name: 'README.md',
  })

  files.push({
    content: buildSummary(data),
    name: 'SUMMARY.md',
  })

  // env
  if(data.apps){
    files.push({
      content: buildResources('Apps', data.apps),
      name: 'apps.md',
      path: 'env'
    })
  }

  if(data.notifications){
    files.push({
      content: buildResources('Notifications', data.notifications),
      name: 'notifications.md',
      path: 'env'
    })
  }

  if(data.roles){
    files.push({
      content: buildResources('Roles', data.roles),
      name: 'roles.md',
      path: 'env'
    })
  }

  if(data.serviceAccounts){
    files.push({
      content: buildResources('Service Accounts', data.serviceAccounts),
      name: 'serviceAccounts.md',
      path: 'env'
    })
  }

  if(data.policies){
    files.push({
      content: buildResources('Policies', data.policies),
      name: 'policies.md',
      path: 'env'
    })
  }

  // Extract data from env files and jsdoc
  // - apps
  // - notifications
  // - roles
  // - serviceAccounts
  // - policies
  // - *runtime
  // - objects
  // - scripts
  //   - routes
  //   - policies
  //   - libraries
  //   - jobs
  //   - triggers
  // - classes
  // - releaseNotes

  // Translate data into Handlebar template data objects & compile

  // Output compiled Handlebar templates



  // const home = Path.resolve(process.cwd(), source),
  //       homeEnv = Path.join(home, 'env'),
  //       manifest = Util.readJsonFile(Path.join(home, 'manifest.json')),

  //       scripts = doclets
  //         .filter(doclet => doclet.meta.path.endsWith('scripts/js'))
  //         .reduce((scriptAcc, doclet) => {

  //           const scriptAccCopy = Object.assign({}, scriptAcc),

  //                 name = doclet.meta.filename.split('.')[1]

  //           if (!scriptAccCopy[name]) {
  //             scriptAccCopy[name] = {}
  //           }

  //           if (doclet.script) {
  //             scriptAccCopy[name].header = doclet
  //           } else if (doclet.kind === 'function') {

  //             if (!scriptAccCopy[name].functions) {
  //               scriptAccCopy[name].functions = []
  //             }

  //             scriptAccCopy[name].functions.push(doclet)
  //           }

  //           return scriptAccCopy
  //         }, {}),

  //       scriptModules = manifest.scripts.includes.map((scriptName) => {

  //         const meta = Util.readJsonFile(Path.join(homeEnv, 'scripts', `${scriptName}.json`)),

  //               script = scripts[scriptName],

  //               name = (script && script.header)
  //                 ? script.header.script
  //                 : meta.label || scriptName,

  //               description = (script && script.header && script.header.description)
  //                 ? script.header.description
  //                 : meta.description,

  //               // create object to hold script functions
  //               objects = script && script.functions && [
  //                 {
  //                   name: 'default',
  //                   type: 'methods',
  //                   functions: Util.translateFunctionDoclets(script.functions)
  //                 }
  //               ],

  //               examples = script && script.header && script.header.examples,

  //               gitbookDescription = script && script.header && script.header.summary

  //         return {
  //           description,
  //           examples,
  //           gitbookDescription,
  //           name,
  //           objects,
  //           file: scriptName
  //         }
  //       }),

  //       files = scriptModules.map(module => ({
  //         content: compile(TEMPLATES.MODULE, module),
  //         name: `${module.file}.md`,
  //         path: 'scripts'
  //       }))
  return files
}

function publish(taffyDb, opts) {
  const [source] = opts._,
        doclets = filterDoclets(taffyDb),
        files = assembleFiles(doclets, source)
  Util.writeFiles(files, Path.normalize(opts.destination))
}

module.exports = {
  publish, // required for JSDoc template
}
