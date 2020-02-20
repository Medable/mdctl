const Path = require('path'),
      Util = require('../util'),
      { loadPartials } = require('../handlebars'),
      TEMPLATES = loadPartials(),
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
      PARAM_TAG_PROPERTIES = Object.freeze({
        canHaveType: true,
        canHaveName: true,
        mustHaveValue: true,
      }),
      ROUTE = Object.freeze({
        params: {
          path: [],
          body: [],
          query: [],
          header: [],
          response: []
        }
      }),
      SCRIPT_TYPES = Object.freeze({
        JOB: 'job',
        LIBRARY: 'library',
        POLICY: 'policy',
        ROUTE: 'route',
        TRIGGER: 'trigger'
      }),
      SCRIPT_TYPE_DIR_MAP = Object.freeze({
        job: 'jobs',
        route: 'routes',
        policy: 'policies',
        library: 'libraries',
        trigger: 'triggers',
      })

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

function loadEnvData(manifest, home, type) {
  return manifest[type] && manifest[type].includes.map(name => Util.readJson(Path.join(home, 'env', type, `${name}.json`)))
}

function loadEnvObjects(manifest, home) {

  const data = {}

  Object.entries(manifest).forEach(([objName, info]) => {
    // is data
    if (!MANIFEST_KNOWN_KEYS.includes(objName)) {
      if (!data[objName]) {
        data[objName] = []
      }
      info.includes.forEach(name => data[objName].push({
        name,
        info: Util.readJson(Path.join(home, 'env', 'data', `${name}.json`)),
      }))
    }
  })

  return manifest.objects && manifest.objects.map(obj => ({
    data: data[obj.name] || [],
    info: Util.readJson(Path.join(home, 'env', 'objects', `${obj.name}.json`)),
  }))
}

function loadEnvScripts(manifest, doclets, home) {
  const scriptDoclets = {}
  doclets.forEach((doclet) => {
    const isScriptFile = doclet.kind === 'file' && doclet.meta.path.endsWith('scripts/js'),
          name = doclet.meta.filename.split('.')[1]
    if (isScriptFile && !scriptDoclets[name]) {
      scriptDoclets[name] = doclet
    }
  })
  return manifest.scripts && manifest.scripts.includes.map((name) => {
    const doclet = scriptDoclets[name],
          info = Object.assign({}, Util.readJson(Path.join(home, 'env', 'scripts', `${name}.json`)), doclet && {
            author: doclet.author,
            summary: doclet.summary,
            version: doclet.version
          }),
          data = { ...(doclet || {}), info }
    if (info.type === SCRIPT_TYPES.ROUTE) {
      if (!data.route) {
        data.route = {}
      }
      data.route.method = info.configuration.method
      data.route.path = info.configuration.path
    }
    if (data.route && data.route.params) {
      data.route.params.path = Util.translateParams(data.route.params.path)
      data.route.params.body = Util.translateParams(data.route.params.body)
      data.route.params.query = Util.translateParams(data.route.params.query)
      data.route.params.header = Util.translateParams(data.route.params.header)
      data.route.params.response = Util.translateParams(data.route.params.response)
    }
    return data
  })
}

function extract(manifest, doclets, home) {
  return {
    apps: loadEnvData(manifest, home, 'apps'),
    notifications: loadEnvData(manifest, home, 'notifications'),
    roles: loadEnvData(manifest, home, 'roles'),
    serviceAccounts: loadEnvData(manifest, home, 'serviceAccounts'),
    policies: loadEnvData(manifest, home, 'policies'),
    objects: loadEnvObjects(manifest, home),
    scripts: loadEnvScripts(manifest, doclets, home)
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

  if (data.runtime) {
    links.push({
      name: 'Runtime',
      uri: 'env/runtime.md'
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
          case SCRIPT_TYPES.ROUTE:
            scripts[1].children.push({
              name: `${script.info.name} - ${script.info.configuration.method.toUpperCase()} ${script.info.configuration.path}`,
              uri: `scripts/routes/${script.info.name}.md`
            })
            break
          case SCRIPT_TYPES.POLICY:
            scripts[2].children.push({
              name: script.info.label || script.info.name,
              uri: `scripts/policies/${script.info.name}.md`
            })
            break
          case SCRIPT_TYPES.LIBRARY:
            scripts[3].children.push({
              name: script.info.label || script.info.name,
              uri: `scripts/libraries/${script.info.name}.md`
            })
            break
          case SCRIPT_TYPES.JOB:
            scripts[4].children.push({
              name: script.info.label || script.info.name,
              uri: `scripts/jobs/${script.info.name}.md`
            })
            break
          case SCRIPT_TYPES.TRIGGER:
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
          .map(resource => Util.breakdownResource(resource, options.level + 1))
  return TEMPLATES.MD_RESOURCE({
    ...options,
    resources,
  })
}

function assembleFiles(doclets, source) {

  const home = Path.resolve(process.cwd(), source),
        manifest = Util.readJson(Path.join(home, 'manifest.json')),
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
        content: TEMPLATES.MD_RESOURCE({ ...Util.breakdownResource(object.info) }),
        name: `${object.info.name}.md`,
        path: 'objects'
      })
      object.data.forEach(objData => files.push({
        content: TEMPLATES.MD_RESOURCE({ ...Util.breakdownResource(objData.info) }),
        name: `${objData.name}.md`,
        path: Path.join('objects', object.info.name)
      }))
    })
  }

  // scripts
  if (data.scripts) {
    files.push(...data.scripts.map(script => ({
      content: TEMPLATES.MD_RESOURCE({
        ...Util.breakdownResource(script.info),
        copyright: script.copyright,
        description: script.description,
        examples: script.examples,
        route: script.route
      }),
      name: `${script.info.name}.md`,
      path: Path.join('scripts', SCRIPT_TYPE_DIR_MAP[script.info.type])
    })))
  }

  return files
}

module.exports = {
  plugin: {
    defineTags: function defineTags(dictionary) {
      dictionary.defineTag('route-param-path', {
        ...PARAM_TAG_PROPERTIES,
        onTagged(doclet, tag) {
          if (!doclet.route) {
            doclet.route = Util.clone(ROUTE) // eslint-disable-line no-param-reassign
          }
          doclet.route.params.path.push(tag.value)
        }
      })
      dictionary.defineTag('route-param-body', {
        ...PARAM_TAG_PROPERTIES,
        onTagged(doclet, tag) {
          if (!doclet.route) {
            doclet.route = Util.clone(ROUTE) // eslint-disable-line no-param-reassign
          }
          doclet.route.params.body.push(tag.value)
        }
      })
      dictionary.defineTag('route-param-query', {
        ...PARAM_TAG_PROPERTIES,
        onTagged(doclet, tag) {
          if (!doclet.route) {
            doclet.route = Util.clone(ROUTE) // eslint-disable-line no-param-reassign
          }
          doclet.route.params.query.push(tag.value)
        }
      })
      dictionary.defineTag('route-param-header', {
        ...PARAM_TAG_PROPERTIES,
        onTagged(doclet, tag) {
          if (!doclet.route) {
            doclet.route = Util.clone(ROUTE) // eslint-disable-line no-param-reassign
          }
          doclet.route.params.header.push(tag.value)
        }
      })
      dictionary.defineTag('route-param-response', {
        ...PARAM_TAG_PROPERTIES,
        onTagged(doclet, tag) {
          if (!doclet.route) {
            doclet.route = Util.clone(ROUTE) // eslint-disable-line no-param-reassign
          }
          doclet.route.params.response.push(tag.value)
        }
      })
    }
  },
  template: {
    publish: function publish(taffyDb, opts) {
      const [source] = opts._,
            doclets = filterDoclets(taffyDb),
            files = assembleFiles(doclets, source)
      Util.writeFiles(files, Path.normalize(opts.destination))
    }
  }
}
