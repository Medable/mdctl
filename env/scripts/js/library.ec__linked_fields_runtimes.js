import { route, log, trigger, as, transform, on } from 'decorators'
import moment from 'moment'
import _ from 'lodash'
import faults from 'c_fault_lib'
import { DocumentProcessor } from 'ec__document_processor'
import { TemplateCloner, TemplateVersionManager } from 'ec__template_manager_lib'
import EconsentUtilities from 'ec__econsent_utilities_lib'
import connections from 'connections'
import logger from 'logger'
import config from 'config'
import cache from 'cache'

const fields = config.get('ec__linked_fields_config')
const { ec__linked_field: linkedFieldsModel } = org.objects

class LinkedFields {

  static KEYS = Object.freeze({
    PUBLISH: 'linkedFields:publish:',
    ERROR: 'linkedFields:error:'
  })

  /**
   * /routes/templates/ec__linked_field_configuration:
   *   get:
   *     description: 'ec__linked_field_configuration'
   *
   *     responses:
   *      '200':
   *        description: 'Returns a ec__linked_field_configuration'
   *        content:
   *          application/json:
   *            schema:
   *              type: boolean
   *              example:
   *                data:
   *                 - ec__key: "c_number"
   *                   ec__placeholder: "site_number"
   *                   ec__label: "നമ്പർ"
   *                 - ec__key: "c_name"
   *                   ec__placeholder: "site_name"
   *                   ec__label: "പേര്"
   *
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'GET',
    name: 'ec__linked_field_configuration',
    path: 'templates/ec__linked_field_configuration'
  })
  static getLinkedFieldConfiguration() {
    return script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
      return LinkedFields.getLinkedFieldConfigurations()
    })
  }

  /**
   * @openapi
   * /routes/econsent/get_linked_fields_status/{templateId}:
   *   get:
   *     description: 'ec__linked_fields_status'
   *     parameters:
   *       - name: templateId
   *         in: path
   *         required: true
   *         description:
   *         schema:
   *           type: uuid
   *
   *     responses:
   *      '200':
   *        description: 'Get linked fields status'
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              example: '{"publishing":"true"}'
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'GET',
    name: 'ec__linked_fields_status',
    path: 'econsent/get_linked_fields_status/:templateId',
    acl: ['role.administrator', 'role.ec__document_author']
  })
  static getLinkedFieldsStatus({ req: { params: { templateId } } }) {
    const errorCode = cache.get(`${LinkedFields.KEYS.ERROR}${templateId}`)
    if (errorCode) {
      faults.throw(errorCode)
    }

    return {
      publishing: Boolean(cache.get(`${LinkedFields.KEYS.PUBLISH}${templateId}`))
    }
  }

  @log({ traceResult: true, traceError: true })
  @trigger(
    'create.before',
    'update.before',
    {
      object: 'ec__document_template',
      weight: -900,
      if: {
        $and: [
          {
            $gte: [
              {
                $indexOfArray: [
                  '$$SCRIPT.arguments.modified',
                  'ec__sites'
                ]
              },
              0
            ]
          }
        ]
      }
    }
  )
  static templateBeforeSiteAssignment({ context }) {
    for (const site of context.read('ec__sites')) {
      EconsentUtilities.validateSiteFields(
        org.objects.c_site.readOne(site)
          .skipAcl()
          .grant('read')
          .paths(fields.map(({ ec__key }) => ec__key))
          .execute(),
        context.read('ec__language')
      )
    }
  }

  @log({ traceResult: true, traceError: true })
  @trigger(
    'create.after',
    'update.after',
    {
      object: 'ec__document_template',
      weight: 1000,
      if: {
        $and: [
          {
            $gte: [
              {
                $indexOfArray: [
                  '$$SCRIPT.arguments.modified',
                  'ec__sites'
                ]
              },
              0
            ]
          },
          {
            $lt: [
              {
                $indexOfArray: [
                  '$$SCRIPT.arguments.modified',
                  'ec__status'
                ]
              },
              0
            ]
          }
        ]
      }
    }
  )
  static templateAfterSitesAssignment({ new: newTemplate, body, context, modified }) {
    if (context.read('ec__status') !== 'published') return

    const request = require('request')

    switch (request.method) {
      case 'POST':
      case 'PUT': {
        return LinkedFields.createLinkedFieldsForSites({ sites: newTemplate.ec__sites, newTemplate, context })
      }

      case 'PATCH': {
        const patches = _.isArray(body()) ? body() : [body()]

        for (const { op, value: { ec__sites } } of patches.filter(({ value }) => value.ec__sites)) {
          switch (op) {
            case 'set': {
              LinkedFields.createLinkedFieldsForSites({ sites: ec__sites, newTemplate, context })
              break
            }
            case 'push': {
              LinkedFields.createLinkedFieldsForSites({ sites: ec__sites, newTemplate, context })
              break
            }
            case 'remove':
            default: {
              break
            }
          }
        }
      }
    }
  }

  static createLinkedFieldsForSites({ sites, newTemplate, context }) {
    script.fire(
      'ec__start_generating_fields',
      { ec__document_template: newTemplate._id, ec__language: context.read('ec__language'), fields, status: context.read('ec__status'), sites }
    )
  }

  @on('ec__start_generating_fields', { name: 'ec__start_generating_fields' })
  static startGeneratingFields({ sites, ec__document_template, ec__language, fields, status, update }) {
    if (
      cache.get(`${LinkedFields.KEYS.PUBLISH}${ec__document_template}`)
    ) {
      return
    }

    LinkedFields.setCacheKeys({ ec__document_template })

    const cursor = org.objects.c_site.find({ _id: { $in: sites } })
      .skipAcl()
      .grant('delete')
      .paths(fields.map(({ ec__key }) => ec__key))

    return org.objects.bulk()
      .add(
        cursor,
        { wrap: false }
      )
      .transform({
        script: 'c_generate_linked_field_transform',
        memo: { ec__document_template, fields, ec__language, status, update }
      })
      .async({
        onComplete: `
          import LinkedFields from 'ec__linked_fields_runtimes'
          
          return LinkedFields.clearCacheKeys()
        `
      })
      .next()
  }

  static setCacheKeys({ ec__document_template }) {
    const $set = {},
          $unset = {}

    console.log(`ADD--${LinkedFields.KEYS.PUBLISH}${ec__document_template}`, true)
    logger.info(`ADD--${LinkedFields.KEYS.PUBLISH}${ec__document_template}`, true)
    cache.set(`${LinkedFields.KEYS.PUBLISH}${ec__document_template}`, true, 3600)

    $set.ec__publishing = true

    // clear error if it exists
    if (cache.get(`${LinkedFields.KEYS.ERROR}${ec__document_template}`)) {
      cache.del(`${LinkedFields.KEYS.ERROR}${ec__document_template}`)

      $unset.ec__errors = 1
    }

    org.objects.ec__document_template.updateOne(ec__document_template, {
      $set,
      $unset
    })
      .skipAcl()
      .grant('update')
      .execute()
  }

  static clearCacheKeys() {
    const { err, memo: { ec__document_template, update } } = script.arguments

    console.log('LFs Generation Complete', { err, ec__document_template })
    logger.info('LFs Generation Complete', { err, ec__document_template })

    try {
      let $set = { ec__publishing: false }

      if (err) {
        const code = faults.getErrCode(err)
        cache.set(`${LinkedFields.KEYS.ERROR}${ec__document_template}`, code)
        $set.ec__errors = err
      } else if (update) {
        $set = {
          ...$set,
          ...update,
          ec__status: 'published'
        }
      }

      org.objects.ec__document_template.updateOne(ec__document_template, { $set })
        .skipAcl()
        .grant('update')
        .execute()
    } finally {
      cache.del(`${LinkedFields.KEYS.PUBLISH}${ec__document_template}`)
      console.log(`DEL--${LinkedFields.KEYS.PUBLISH}${ec__document_template}`, true, 3600)
      logger.info(`DEL--${LinkedFields.KEYS.PUBLISH}${ec__document_template}`, true, 3600)
    }
  }

  static renderLinkedFields({ documentTemplate, signedDocument, ec__html }) {
    let lfs
    if (documentTemplate.ec__status === 'published') {
      const linkedFields = linkedFieldsModel.find({
        ec__document_template: documentTemplate._id,
        ec__site: {
          $in: [signedDocument.ec__site._id]
        }
      })
        .skipAcl()
        .grant('read')
        .toArray()

      lfs = linkedFields.reduce((result, { ec__placeholder, ec__value }) => {
        result[ec__placeholder] = ec__value
        return result
      }, {})
    } else {
      const siteCursor = org.objects.c_sites.find({ _id: signedDocument.ec__site._id })
        .expand('c_site_address', 'c_contacts')
        .skipAcl()
        .grant('read')

      if (!siteCursor.hasNext()) {
        faults.throw('econsent.validationError.signedDocHasNoSite')
      }

      const site = siteCursor.next()
      lfs = EconsentUtilities.constructSiteLinkedFields(site, documentTemplate.ec__language)
    }
    return DocumentProcessor.processHtmlTemplate(ec__html, lfs)
  }

  static getDefaultSite() {
    const c_account = script.principal._id

    const { c_sites: { data: [userSite] } } = org.objects.account.readOne(c_account)
      .paths('c_sites._id')
      .execute()

    if (!userSite) faults.throw('axon.invalidArgument.validSiteRequired')

    return userSite._id
  }

  static deferEventExecution(event, param, duration) {
    return org.objects.Events.insertOne({
      type: 'script',
      event,
      param,
      start: moment()
        .add(duration, 'seconds')
        .toISOString()
    })
      .grant('update')
      .bypassCreateAcl()
      .execute()
  }

  @trigger('err.events.failed')
  handleError({ context, params: { err } }) {
    const message = `Error in Cortex Event: ${context.event} with key: ${context.key}`
    logger.error(message, err)
    console.log(message, err)
  }

  /**
   * Retrieves and processes linked field configurations
   *
   * This method:
   * 1. Fetches linked field configurations from the 'ec__linked_fields_config' config
   * 2. Retrieves the c_site object schema properties from the database
   * 3. Processes each linked field configuration:
   *    - For nested properties (with dots in the key), restructures the property path
   *    - If a configuration doesn't have an explicit ec__label, attempts to retrieve it
   *      from the corresponding property in the c_site schema
   * 4. Returns a flattened union of all linked field configurations with labels
   *
   * If labels have a localization property (even if enabled is false), the labels need to be
   * added to https://gitlab.medable.com/axon/org/-/blob/development/i18n/src/env/i18ns/schemas/axon_schemas_en_US.json#L600
   * @returns {Array} The processed linked field configurations with resolved labels
   */
  static getLinkedFieldConfigurations() {
    const linkedFieldsConfigs = _.groupBy(config.get('ec__linked_fields_config'), 'ec__key')

    let [{ properties }] = org.objects.objects.find({ name: 'c_site' })
    properties = _.groupBy(properties, 'name')

    for (const key of Object.keys(linkedFieldsConfigs)) {
      let propertyKey = key
      const keyParts = key.split('.')

      if (keyParts.length > 1) {
        if (Array.isArray(_.get(properties, `${keyParts[0]}.[0].properties`))) {
          _.set(properties, `${keyParts[0]}.[0].properties`, _.groupBy(_.get(properties, `${keyParts[0]}.[0].properties`), 'name'))
        }
        propertyKey = keyParts.join('.[0].properties.')
      }

      if (!linkedFieldsConfigs[key][0].ec__label) {
        linkedFieldsConfigs[key][0].ec__label = _.get(properties, `${propertyKey}.[0].label`)
      }
    }

    return _.union(...Object.values(linkedFieldsConfigs))
  }

}

module.exports = LinkedFields