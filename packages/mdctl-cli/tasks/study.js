/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      jsyaml = require('js-yaml'),
      { rString, isSet } = require('@medable/mdctl-core-utils/values'),
      { StudyManifestTools } = require('@medable/mdctl-axon-tools'),
      { Fault } = require('@medable/mdctl-core'),
      exportEnv = require('../lib/env/export'),
      Task = require('../lib/task'),
      {
        askSelectTasks,
        askSelectConsentTemplates
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
          studyTools = new StudyManifestTools(client, params)

    try {
      const { manifest } = await studyTools.getStudyManifest()

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


    } catch (e) {
      throw e
    }
  }

  async 'study@import'(cli) {
    console.log('Starting Study Import')
    const params = await cli.getArguments(this.optionKeys)

    params.triggers = false
    params.backup = false

    const env = new Env()
    
    await env['env@import'](cli)
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
      // eslint-disable-next-line one-var
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

      // eslint-disable-next-line one-var
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
        task [action] - Allows the select of tasks to export from the current org  
        consent [action] - Allows the select of consent templates to export from the current org                                                                                                                                   
    `
  }

}

module.exports = Study
