const path = require('path'),
      util = require('../util'),
      { loadPartials } = require('../handlebars'),
      TEMPLATES = loadPartials(),
      CLASS_SCOPES = Object.freeze([
        'inner',
        'global',
        'static',
      ]),
      DOCLET_KINDS = Object.freeze([
        'file',
        'class',
        'function',
      ]),
      MANIFEST_KNOWN_KEYS = Object.freeze([
        'apps',
        'env',
        'notifications',
        'object',
        'objects',
        'policies',
        'roles',
        'scripts',
        'smsNumbers',
        'templates',
        'views'
      ]),
      RESOURCE_TYPES = Object.freeze({
        JOB: 'job',
        LIBRARY: 'library',
        POLICY: 'policy',
        ROUTE: 'route',
        TRIGGER: 'trigger'
      }),
      PLURAL_RESOURCES = Object.freeze({
        job: 'jobs',
        route: 'routes',
        policy: 'policies',
        library: 'libraries',
        trigger: 'triggers',
      })

function readManifestJsons(key, returnList = item => item, manifest = {}, home = process.cwd()) {
  return manifest[key]
    ? returnList(manifest[key]).map(name => util.readJson(path.join(home, 'env', key, `${name}.json`)))
    : []
}

function readManifestObjects(manifest, home) {

  const data = {}

  Object.entries(manifest).forEach(([objName, info]) => {
    // is data
    if (!MANIFEST_KNOWN_KEYS.includes(objName)) {
      if (!data[objName]) {
        data[objName] = []
      }
      info.includes.forEach(name => data[objName].push({
        name,
        info: util.readJson(path.join(home, 'env', 'data', `${name}.json`)),
      }))
    }
  })

  return manifest.objects && manifest.objects.map(obj => ({
    data: data[obj.name] || [],
    info: util.readJson(path.join(home, 'env', 'objects', `${obj.name}.json`)),
  }))
}

function getRouteId(location, method) {
  return `${location}${method}`
}

function readManifestScripts(manifest, doclets, home) {
  const scripts = {},
        resourceMap = {},
        resources = util.readJson(path.join(home, 'resources.json'), [])

  doclets.forEach((doclet) => {
    const name = doclet.meta.filename.split('.')[1],
          isClassDefinition = doclet.kind === 'class' && CLASS_SCOPES.includes(doclet.scope),
          isClassMethod = doclet.kind === 'function' && doclet.meta.code.type === 'MethodDefinition',
          isClassConstructor = doclet.name === doclet.memberof
            && doclet.scope === 'instance'
            && doclet.kind === 'class'
    if (!scripts[name]) {
      scripts[name] = {
        classes: {},
        routes: {}
      }
    }

    if (doclet.kind === 'file') {
      scripts[name].doclet = doclet
    } else if (isClassDefinition) {
      scripts[name].classes[doclet.name] = {
        type: 'Class',
        description: doclet.description,
        functions: []
      }
    } else if ((isClassMethod || isClassConstructor) && scripts[name].classes[doclet.memberof]) {
      scripts[name].classes[doclet.memberof].functions.push({
        description: doclet.description,
        name: doclet.name,
        params: doclet.paramsFormatted,
        paramString: doclet.meta.code.paramnames.join(', ')
      })
    }

    if (doclet.route && doclet.route.path && doclet.route.method) {
      scripts[name].routes[getRouteId(doclet.route.path, doclet.route.method)] = doclet.route
    }
  })
  resources.forEach((resource) => {
    if (resource.type !== RESOURCE_TYPES.LIBRARY) {
      const scriptName = resource.metadata.scriptExport
      if (!resourceMap[scriptName]) {
        resourceMap[scriptName] = []
      }
      resourceMap[scriptName].push(resource)
    }
  })

  return manifest.scripts && manifest.scripts.includes.map((name) => {
    const docletInfo = scripts[name],
          info = Object.assign({}, util.readJson(path.join(home, 'env', 'scripts', `${name}.json`)), docletInfo && docletInfo.doclet && {
            author: docletInfo.doclet.author,
            summary: docletInfo.doclet.summary,
            version: docletInfo.doclet.version
          }),
          data = { ...((docletInfo && docletInfo.doclet) || {}), info }

    if (docletInfo && docletInfo.classes) {
      data.classes = Object.entries(docletInfo.classes).map(([key, value]) => ({
        name: key,
        ...value,
      }))
    }

    if (resourceMap[name]) {
      resourceMap[name].forEach((resource) => {
        const {
                configuration,
                type
              } = resource,
              field = PLURAL_RESOURCES[type]

        switch (type) {
          case RESOURCE_TYPES.ROUTE:
            if (!data[field]) { data[field] = [] }
            data[field].push(Object.assign({}, {
              method: configuration.method,
              path: configuration.path
            }, info.type === RESOURCE_TYPES.ROUTE
              ? docletInfo
                && docletInfo.doclet
                && docletInfo.doclet.route
              : docletInfo
                && docletInfo.routes[getRouteId(configuration.path, configuration.method)]))
            break
          default:
            if (!info[field]) { info[field] = [] }
            info[field].push(resource)
        }

      })
    }

    return data
  })
}

function extract(manifest, doclets, home) {
  return {
    apps: readManifestJsons('apps', item => item.includes, manifest, home),
    notifications: readManifestJsons('notifications', item => item.includes, manifest, home),
    roles: readManifestJsons('roles', item => item.includes, manifest, home),
    serviceAccounts: readManifestJsons('serviceAccounts', item => item.includes, manifest, home),
    policies: readManifestJsons('policies', item => item.includes, manifest, home),
    objects: readManifestObjects(manifest, home),
    scripts: readManifestScripts(manifest, doclets, home)
  }
}

function buildSummary(data) {

  const links = [
          {
            name: 'Introduction',
            uri: 'README.md'
          }
        ],

        sections = []

  if (data.apps) {
    links.push({
      name: 'Apps',
      uri: 'env/apps.md'
    })
  }

  if (data.notifications) {
    links.push({
      name: 'Notifications',
      uri: 'env/notifications.md'
    })
  }

  if (data.roles) {
    links.push({
      name: 'Roles',
      uri: 'env/roles.md'
    })
  }

  if (data.serviceAccounts) {
    links.push({
      name: 'Service Accounts',
      uri: 'env/serviceAccounts.md'
    })
  }

  if (data.policies) {
    links.push({
      name: 'Policies',
      uri: 'env/policies.md'
    })
  }

  if (data.objects) {
    sections.push({
      label: 'Objects',
      links: data.objects.map(object => ({
        name: object.info.label || object.info.name,
        uri: `objects/${object.info.name}.md`,
        children: object.data.map(dataObj => ({
          name: dataObj.name,
          uri: `objects/${object.info.name}/${dataObj.name}.md`
        }))
      }))
    })
  }

  if (data.scripts) {
    sections.push({
      label: 'Scripts',
      links: data.scripts.reduce((scripts, script) => {
        switch (script.info.type) {
          case RESOURCE_TYPES.ROUTE:
            scripts[1].children.push({
              name: `${script.info.name} - ${script.info.configuration.method.toUpperCase()} ${script.info.configuration.path}`,
              uri: `scripts/routes/${script.info.name}.md`
            })
            break
          case RESOURCE_TYPES.POLICY:
            scripts[2].children.push({
              name: script.info.label || script.info.name,
              uri: `scripts/policies/${script.info.name}.md`
            })
            break
          case RESOURCE_TYPES.LIBRARY:
            scripts[3].children.push({
              name: script.info.label || script.info.name,
              uri: `scripts/libraries/${script.info.name}.md`
            })
            break
          case RESOURCE_TYPES.JOB:
            scripts[4].children.push({
              name: script.info.label || script.info.name,
              uri: `scripts/jobs/${script.info.name}.md`
            })
            break
          case RESOURCE_TYPES.TRIGGER:
            scripts[5].children.push({
              name: script.info.label || script.info.name,
              uri: `scripts/triggers/${script.info.name}.md`
            })
            break
          default:
            console.log(`Unknown script type ${script.info.name}:${script.info.type}`)
        }
        return scripts
      }, [
        {
          name: 'Introduction',
          uri: 'scripts/README.md'
        },
        {
          name: 'Routes',
          uri: 'scripts/routes/README.md',
          children: []
        },
        {
          name: 'Policies',
          uri: 'scripts/policies/README.md',
          children: []
        },
        {
          name: 'Libraries',
          uri: 'scripts/libraries/README.md',
          children: []
        },
        {
          name: 'Jobs',
          uri: 'scripts/jobs/README.md',
          children: []
        },
        {
          name: 'Triggers',
          uri: 'scripts/triggers/README.md',
          children: []
        }
      ])
    })
  }

  return TEMPLATES.GITBOOK_SUMMARY({
    links,
    sections,
    label: 'Table of Contents'
  })
}

function buildResource(opts) {
  const options = Object.assign({}, { level: 1, resources: [] }, opts),
        resources = options.resources
          .map(resource => util.breakdownResource(resource, options.level + 1))
  return TEMPLATES.MD_RESOURCE({
    ...options,
    resources,
  })
}

function assembleFiles(doclets, source) {

  const home = path.resolve(process.cwd(), source),
        manifest = util.readJson(path.join(home, 'manifest.json')),
        data = extract(manifest, doclets, home),
        files = []

  // READMEs
  files.push({
    content: TEMPLATES.GITBOOK_README({
      label: 'Introduction'
    }),
    name: 'README.md'
  })

  files.push({
    content: TEMPLATES.GITBOOK_README({
      label: 'Objects'
    }),
    name: 'README.md',
    path: 'objects'
  })

  files.push({
    content: TEMPLATES.GITBOOK_README({
      label: 'Scripts'
    }),
    name: 'README.md',
    path: 'scripts'
  })

  files.push({
    content: TEMPLATES.GITBOOK_README({
      label: 'Routes'
    }),
    name: 'README.md',
    path: 'scripts/routes'
  })

  files.push({
    content: TEMPLATES.GITBOOK_README({
      label: 'Policies'
    }),
    name: 'README.md',
    path: 'scripts/policies'
  })

  files.push({
    content: TEMPLATES.GITBOOK_README({
      label: 'Libraries'
    }),
    name: 'README.md',
    path: 'scripts/libraries'
  })

  files.push({
    content: TEMPLATES.GITBOOK_README({
      label: 'Jobs'
    }),
    name: 'README.md',
    path: 'scripts/jobs'
  })

  files.push({
    content: TEMPLATES.GITBOOK_README({
      label: 'Triggers'
    }),
    name: 'README.md',
    path: 'scripts/triggers'
  })

  files.push({
    content: buildSummary(data),
    name: 'SUMMARY.md'
  })

  // env
  if (data.apps) {
    files.push({
      content: buildResource({
        label: 'Apps',
        resources: data.apps
      }),
      name: 'apps.md',
      path: 'env'
    })
  }

  if (data.notifications) {
    files.push({
      content: buildResource({
        label: 'Notifications',
        resources: data.notifications
      }),
      name: 'notifications.md',
      path: 'env'
    })
  }

  if (data.roles) {
    files.push({
      content: buildResource({
        label: 'Roles',
        resources: data.roles
      }),
      name: 'roles.md',
      path: 'env'
    })
  }

  if (data.serviceAccounts) {
    files.push({
      content: buildResource({
        label: 'Service Accounts',
        resources: data.serviceAccounts
      }),
      name: 'serviceAccounts.md',
      path: 'env'
    })
  }

  if (data.policies) {
    files.push({
      content: buildResource({
        label: 'Policies',
        resources: data.policies
      }),
      name: 'policies.md',
      path: 'env'
    })
  }

  // objects
  if (data.objects) {
    data.objects.forEach((object) => {
      files.push({
        content: TEMPLATES.MD_RESOURCE({ ...util.breakdownResource(object.info) }),
        name: `${object.info.name}.md`,
        path: 'objects'
      })
      object.data.forEach(objData => files.push({
        content: TEMPLATES.MD_RESOURCE({ ...util.breakdownResource(objData.info) }),
        name: `${objData.name}.md`,
        path: path.join('objects', object.info.name)
      }))
    })
  }

  // scripts
  if (data.scripts) {
    files.push(...data.scripts.map(script => ({
      content: TEMPLATES.MD_RESOURCE({
        ...util.breakdownResource(script.info),
        classes: script.classes,
        copyright: script.copyright,
        description: script.description,
        examples: script.examples,
        routes: script.routes
      }),
      name: `${script.info.name}.md`,
      path: path.join('scripts', PLURAL_RESOURCES[script.info.type])
    })))
  }

  return files
}

module.exports = {
  parser: 'jsdoc',
  generate: function generate(ast, options) {
    const {
            destination,
            source
          } = options,

          // identify only doclets we're interested in
          doclets = ast.filter((doclet) => {
            const isNotPackage = doclet.kind !== 'package',
                  isDocumented = !doclet.undocumented,
                  isInterestingKind = DOCLET_KINDS.includes(doclet.kind),
                  isClassConstructor = doclet.name === doclet.memberof && doclet.scope === 'instance',
                  containsRoute = !!doclet.route,
                  isExports = doclet.meta
              && doclet.meta.code
              && doclet.meta.code.name
              && typeof doclet.meta.code.name === 'string'
              && doclet.meta.code.name.includes('exports.')

            return isNotPackage
              && (isDocumented
                || (isInterestingKind && (!isExports || isClassConstructor)) || containsRoute)
          }),

          files = assembleFiles(doclets, source)

    util.writeFiles(files, path.normalize(destination))
  }
}
