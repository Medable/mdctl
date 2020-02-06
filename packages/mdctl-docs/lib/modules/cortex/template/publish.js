const Path = require('path')
const {
  compile,
  TEMPLATES,
} = require('../../../handlebars')
const Util = require('../../../util')

function assembleFiles(taffyDb){

  // documented, non-package
  const doclets = taffyDb({
    kind: {
      '!is':'package'
    },
    undocumented: {
      isUndefined: true
    }
  }).get()

  const modules = {}
  function ensureModule(name){
    if(!modules[name]){
      modules[name] = {}
    }
  }

  for(const doclet of doclets){

    // is module
    if(doclet.kind === 'module'){
      const {
        description,
        name
      } = doclet
      ensureModule(name)
      Object.assign(modules[name], {
        description,
        name: Util.capitalizeFirstCharacter(name)
      })
    }

    // is class
    if(doclet.kind === 'class'){
      const {
        description,
        memberof,
        name,
      } = doclet
      ensureModule(memberof)

      if(!modules[memberof].objects){
        modules[memberof].objects = []
      }

      modules[memberof].objects.push({
        name,
        description,
        extends: doclet.augments && doclet.augments[0],
        type: doclet.kind,
      })
    }

    // is function (instance, static)
    else if(doclet.kind === 'function' && ['instance', 'static'].includes(doclet.scope)){
      const {
        description,
        memberof,
        name,
        params,
      } = doclet

      const [
        moduleName,
        objectName,
      ] = memberof.split('.')

      const module = modules[moduleName]
      if(module && module.objects){
        const object = module.objects.find(({ name }) => name === objectName)
        if(object){
          if(!object.functions){
            object.functions = []
          }

          object.functions.push({
            description,
            name,
            paramString: params && Util.reduceParamString(params),
            params: params && Util.reduceParams(params, {
              arg: [],
              return: []
            })
          })
        }
      }
    }

    // is route
    else if(doclet.route) {
      const {
        description,
        memberof,
        meta,
        params,
        route,
        tabs
      } = doclet

      ensureModule(memberof)
      if(!modules[memberof].routes){
        modules[memberof].routes = []
      }

      modules[memberof].routes.push({
        description,
        tabs,
        params: params && Util.reduceParams(params, {
          path: [],
          body: [],
          query: [],
          header: [],
          response: []
        }),
        method: route.method.toUpperCase(),
        path: route.path,
      })
    }
  }

  const files = Object.values(modules).map(module => ({
    content: compile(TEMPLATES.MODULE, module),
    name: `${module.name.toLowerCase()}.md`
  }))
  return files
}

function publish(taffyDb, opts, tutorials){
  const files = assembleFiles(taffyDb)
  Util.writeFiles(files, Path.normalize(opts.destination))
}

module.exports = {
  publish, // required for JSDoc template
}