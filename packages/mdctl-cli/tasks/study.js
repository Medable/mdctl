/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      fs = require('fs'),
      jsyaml = require('js-yaml'),
      { rString, isSet } = require('@medable/mdctl-core-utils/values'),
      { StudyManifestTools } = require('@medable/mdctl-axon-tools'),
      { Fault } = require('@medable/mdctl-core'),
      exportEnv = require('../lib/env/export'),
      Task = require('../lib/task'),
      {
        askSelectTasks,
        askSelectConsentTemplates,
        askSelectDtConfigs
      } = require('../lib/studyQuestions'),
      Env = require('./env')

class Study extends Task {

  constructor() {

    const options = {
      triggers: {
        type: 'boolean',
        default: false
      },
      backup: {
        type: 'boolean',
        default: false
      },
      silent: {
        type: 'boolean',
        default: false
      },
      production: {
        type: 'boolean',
        default: false
      },
      dir: {
        type: 'string',
        default: ''
      },
      manifestOnly: {
        type: 'boolean',
        default: false
      },
      manifestObject: {
        type: 'string',
        default: ''
      },
      preserveTemplateStatus: {
        type: 'boolean',
        default: false
      },
      excludeTemplates: {
        type: 'boolean',
        default: false
      }
    }

    super(options)
    this.optionKeys = Object.keys(options)
  }

  static get taskNames() {

    return ['study']

  }

  async run(cli) {

    const arg1 = this.args('1'),
          handler = `study@${arg1}`

    if (!isSet(arg1)) {
      return console.log(Study.help(cli))
    }

    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }
    return this[handler](cli)


  }

  async 'study@export'(cli) {
    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          params = await cli.getArguments(this.optionKeys),
          studyTools = new StudyManifestTools(client, params),
          manifestObj = params.manifestObject,
          excludeTemplates = !!params.excludeTemplates

    try {
      let manifestJSON
      if (manifestObj) {
        manifestJSON = this.validateManifest(manifestObj, studyTools.getAvailableObjectNames())
      }
      const { manifest } = await studyTools.getStudyManifest(manifestJSON, excludeTemplates)

      if (!params.manifestOnly) {
        const options = {
          format: 'json',
          manifest,
          ...params
        }
        console.log('Starting Study Export')
        await exportEnv({ client, ...options })
      }

      console.log('Study Export finished...!')
      return manifest

    } catch (e) {
      throw e
    }
  }

  async 'study@import'(cli) {
    console.log('Starting Study Import')
    const params = await cli.getArguments(this.optionKeys),
          env = new Env()

    params.triggers = false
    params.backup = false

    await env['env@import'](cli, params.preserveTemplateStatus)
  }

  async 'study@tasks'(cli) {

    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          params = await cli.getArguments(this.optionKeys),
          studyTools = new StudyManifestTools(client, params),
          action = this.args('2')

    if (!action) {
      throw Fault.create('kInvalidArgument', { reason: 'You must provide an action (import or export)' })
    }

    try {
      const tasks = await studyTools.getTasks(),
            selectedTasks = await askSelectTasks({ tasks })
      if (!selectedTasks.length) throw Fault.create('kInvalidArgument', { reason: 'No Tasks selected' })
      const { manifest } = await studyTools.getTasksManifest(selectedTasks)


      if (!params.manifestOnly) {
        const options = {
          format: 'json',
          manifest,
          ...params
        }
        console.log('Starting Study Data Export')
        await exportEnv({ client, ...options })
      }

      console.log('Export finished...!')


    } catch (e) {
      throw e
    }


  }

  async 'study@consent'(cli) {

    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          params = await cli.getArguments(this.optionKeys),
          studyTools = new StudyManifestTools(client, params),
          action = this.args('2')

    if (!action) {
      throw Fault.create('kInvalidArgument', { reason: 'You must provide an action (import or export)' })
    }

    try {
      const consents = await studyTools.getConsentTemplates(),
            selectedConsents = await askSelectConsentTemplates({ consents })
      if (!selectedConsents.length) throw Fault.create('kInvalidArgument', { reason: 'No Consents selected' })

      const { manifest } = await studyTools.getConsentsManifest(selectedConsents)
      if (!params.manifestOnly) {
        const options = {
          format: 'json',
          manifest,
          ...params
        }
        console.log('Starting Study Data Export')
        await exportEnv({ client, ...options })
      }

      console.log('Export finished...!')


    } catch (e) {
      throw e
    }


  }

  async 'study@data-transfer'(cli) {

    const authOptions = await cli.getAuthOptions(),
      client = await cli.getApiClient({ credentials: authOptions }),
      params = await cli.getArguments(this.optionKeys),
      studyTools = new StudyManifestTools(client, params)

    try {
      const dtConfigs = await studyTools.getDtConfigs(),
            selectedDtConfigs = await askSelectDtConfigs(dtConfigs)
      if (!selectedDtConfigs.length) throw Fault.create('kInvalidArgument', { reason: 'No Configs selected' })
      const { manifest } = await studyTools.getDtConfigsManifest(selectedDtConfigs)
      if (!params.manifestOnly) {
        const options = {
          format: 'json',
          manifest,
          ...params
        }
        console.log('Starting Study Data Export')
        await exportEnv({ client, ...options })
      }

      console.log('Export finished...!')
    } catch (e) {
      throw e
    }

  }

  validateManifest(manifestObject, validKeys) {
    let manifestJSON
    try {
      manifestJSON = JSON.parse(manifestObject)
    } catch (e) {
      try {
        if (!fs.existsSync(manifestObject)) {
          throw Fault.create('kInvalidArgument', { reason: 'The manifest file does not exists' })
        }
        manifestJSON = JSON.parse(fs.readFileSync(manifestObject))
      } catch (err) {
        if (err instanceof SyntaxError) {
          throw Fault.create('kInvalidArgument', { reason: 'The manifest is not a valid JSON' })
        }
        throw err
      }
    }
    /*
      We are allowing to export only "parent" objects, i.e. objects
      that have dependencies
    */
    manifestJSON = _.pick(manifestJSON, ['object', ...validKeys])
    if (_.isEqual(manifestJSON, { object: 'manifest' })) {
      // This means that the manifest passed does not contain any object to export
      throw Fault.create('kInvalidArgument', { reason: 'Nothing to export' })
    }
    if (!manifestJSON.object || manifestJSON.object !== 'manifest') {
      throw Fault.create('kInvalidArgument', { reason: 'Invalid manifest. Please make sure it contains the right key/value ("object": "manifest")' })
    }
    return manifestJSON
  }

  mergeJsonArgIf(options, arg) {

    const value = this.args(arg)
    if (rString(value)) {
      const parsed = JSON.parse(value)
      options[arg] = _.merge(options[arg], parsed) // eslint-disable-line no-param-reassign
    }
  }

  applyArgIf(options, arg) {
    const value = this.args(arg)
    if (isSet(value)) {
      options[arg] = value // eslint-disable-line no-param-reassign
    }
  }

  static formatOutput(data, format = 'pretty') {

    switch (format) {
      case 'json':
        return JSON.stringify(data)
      case 'pretty':
        return JSON.stringify(data, null, 2)
      case 'yaml':
        return jsyaml.safeDump(data)
      case 'text':
        return data && _.isFunction(data.toString) ? data.toString() : String(data)
      default:
        throw new RangeError('Invalid output format. Expected json, pretty, text or yaml')
    }

  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'Study interaction tools'
  }

  static help() {

    return `
    Study Tools

    Usage:

      mdctl study [command]

    Arguments:

      Command
        export - Exports the study from the current org
        import - Imports the study into the current org
        task [action] - Allows the select of tasks to export from the current org
        consent [action] - Allows the select of consent templates to export from the current org
        data-transfer - Allows the select of data transfer configs to export from the current org

      Options

        --manifestObject -  receives a valid manifest JSON object \x1b[4OR\x1b[0m the path to a manifest file to
                            specify the entities to export (e.g. tasks and consents, etc...).
                            The manifest can only contain object instances, other org config objects
                            can be exported through "mdctl env export" command

        --preserveTemplateStatus - If set, keep template status as is while importing

        --excludeTemplates - for study export: exclude eTemplates from manifest and export folder. Default false.

      Notes

        --manifestObject is \x1b[4monly available for "export" command and it currently supports ONLY Assignments and eConsents\x1b[0m;
                         it is expected to have the following format:
        {
          "<OBJECT_NAME_1>": {
            "includes": [
              "key_1", "key_2", etc...
            ]
          },
          "<OBJECT_NAME_X>": {
            "includes": [
              "key_N", "key_N+1", etc...
            ]
          }
          "object": "manifest"
        }
    `
  }

}

module.exports = Study
