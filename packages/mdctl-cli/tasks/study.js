/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      jsyaml = require('js-yaml'),
      fs = require('fs'),
      { rString, isSet, stringToBoolean } = require('@medable/mdctl-core-utils/values'),
      { StudyManifestTools } = require('@medable/mdctl-axon-tools'),
      ndjson = require('ndjson'),
      { Fault } = require('@medable/mdctl-core'),
      exportEnv = require('../lib/env/export'),
      Task = require('../lib/task'),
      {
        askSelectTasks,
        askSelectConsentTemplates
      } = require('../lib/studyQuestions')


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
          studyTools = new StudyManifestTools(client, params),
          outputDir = params.dir || process.cwd()


    try {
      const { manifest, removedEntities } = await studyTools.getStudyManifest(),
            issues = removedEntities.reduce((a, v) => {
              a.push(...v.issues)
              return a
            }, [])

      fs.writeFileSync(`${outputDir}/Report.json`, JSON.stringify(issues, null, 2))
      fs.writeFileSync(`${outputDir}/DetailedReport.json`, JSON.stringify(removedEntities, null, 2))
      fs.writeFileSync(`${outputDir}/manifest.json`, JSON.stringify(manifest, null, 2))

      if (!params.manifestOnly) {
        const options = {
          format: 'json',
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

  async 'study@tasks'(cli) {
    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          params = await cli.getArguments(this.optionKeys),
          studyTools = new StudyManifestTools(client, params),
          outputDir = params.dir || process.cwd()


    try {
      const tasks = await studyTools.getTasks(),
            selectedTasks = await askSelectTasks({ tasks }),
            { manifest, removedEntities } = await studyTools.getTasksManifest(selectedTasks),
            issues = removedEntities.reduce((a, v) => {
              a.push(...v.issues)
              return a
            }, [])

      fs.writeFileSync(`${outputDir}/Report.json`, JSON.stringify(issues, null, 2))
      fs.writeFileSync(`${outputDir}/DetailedReport.json`, JSON.stringify(removedEntities, null, 2))
      fs.writeFileSync(`${outputDir}/manifest.json`, JSON.stringify(manifest, null, 2))

      if (!params.manifestOnly) {
        const options = {
          format: 'json',
          ...params
        }
        console.log('Starting Study Data Export')
        await exportEnv({ client, ...options })
      }

      console.log('Study Export finished...!')


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
    `
  }

}

module.exports = Study
