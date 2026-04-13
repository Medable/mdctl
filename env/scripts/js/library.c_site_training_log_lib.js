import nucUtils from 'c_nucleus_utils'
import config from 'config'
import {
  trigger,
  route,
  log
} from 'decorators'

import faults from 'c_fault_lib'

export class SiteTrainingLogLib {

  @trigger('create.before', 'update.before', {
    object: 'c_study_resource',
    weight: 1,
    if: {
      $eq: [
        {
          $pathTo: ['$$ROOT', 'type']
        },
        'c_site_training_pdf'
      ]
    }
  })
  static validateSiteTrainingResource({ context, modified, new: newResource, old, event }) {
    const type = newResource.type || old.type
    if (!type === 'c_site_training_pdf') {
      return
    }

    if (newResource.c_available_to !== 'site_only') {
      faults.throw('axon.invalidArgument.incorrectSiteTrainingStudyResourceAvailableTo')
    }

  }

  /**
   * @openapi
   * /c_site_training_log:
   *  get:
   *    description: 'return a list of c_site_training_logs for the currently logged-in principal who must be a site user'
   *    parameters:
   *      locale: the user's locale
   *    responses:
   *      '200':
   *        description: c_site_training_log object list
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/components/schemas/c_site_training_log'
   *      '400':
   *        description: cortex.accessDenied.instanceRead
   */
  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'c_site_training_logs_get',
    path: 'c_site_training_log',
    acl: ['account.public']
  })
  static getSiteTrainingLogs({ req }) {
    if (!nucUtils.isSiteUser()) {
      faults.throw('cortex.accessDenied.instanceRead')
    }
    const trainingLogs = org.objects.c_site_training_log.find({ c_account: script.principal._id })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()
    const trainingConfig = config.get('site__training_config')

    if (!trainingLogs.length || !trainingConfig || !Array.isArray(trainingConfig)) {
      return { trainingLogs, allModulesComplete: false }
    }

    const { modules } = trainingConfig.find(c => { return c.locales.length && c.locales.includes('en_US') }) || { modules: [] }
    let requiredModuleCodes = modules.map(m => m.code)
    let completedModuleCodes = trainingLogs.filter(l => l.c_completion_status === 'completed')
      .map(m => m.c_code)
    requiredModuleCodes = Array.from(new Set(requiredModuleCodes))
    completedModuleCodes = Array.from(new Set(completedModuleCodes))

    const allModulesComplete = (requiredModuleCodes.length && completedModuleCodes.length) && requiredModuleCodes.every(code => completedModuleCodes.includes(code))

    return {
      trainingLogs,
      allModulesComplete: Boolean(allModulesComplete)
    }
  }

  /**
   * @openapi
   * /c_site_training_log:
   *  post:
   *    description: 'Create c_site_training_log record'
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *             $ref: '#/components/schemas/c_site_training_log'
   *
   *    responses:
   *      '200':
   *        description: c_site_training_log object list
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/components/schemas/c_site_training_log'
   *      '400':
   *        description: cortex.accessDenied.instanceCreate
   *        description: cortex.validation.kRequired
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_site_training_logs_create',
    path: 'c_site_training_log',
    acl: ['account.public']
  })
  static createTrainingLog({ body, req }) {
    if (!nucUtils.isSiteUser()) {
      faults.throw('cortex.accessDenied.instanceCreate')
    }

    const { c_module_id, c_module_name, c_completion_status, c_vendor, c_locale, c_code } = body()
    const trainingLog = { c_module_id, c_module_name, c_completion_status, c_vendor, c_locale, c_code }

    for (const [name, value] of Object.entries(trainingLog)) {
      if (!value) {
        throw Fault.create('cortex.validation.kRequired', { path: `${name}` })
      }
    }
    trainingLog.c_device = req.headers['user-agent']
    trainingLog.c_account = script.principal._id

    return org.objects.c_site_training_log.insertOne(trainingLog)
      .bypassCreateAcl()
      .grant(consts.accessLevels.update)
      .lean(false)
      .execute()
  }

}