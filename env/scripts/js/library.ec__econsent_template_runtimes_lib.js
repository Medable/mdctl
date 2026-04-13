import { route, log, trigger, as } from 'decorators'
import { DocumentProcessor } from 'ec__document_processor'
import { TemplateVersionManager } from 'ec__template_manager_lib'
import LinkedFields from 'ec__linked_fields_runtimes'
import moment from 'moment'
import cache from 'cache'
import faults from 'c_fault_lib'
import _ from 'underscore'
import EconsentLibrary from 'ec__econsent_lib'
import EconsentUtilities from 'ec__econsent_utilities_lib'
import config from 'config'
import logger from 'logger'

const fields = config.get('ec__linked_fields_config')
const {
  c_studies,
  ec__document_templates,
  c_sites,
  ec__default_document_css
} = org.objects
const { accessLevels } = consts

class EconsentTemplateRoutes {

  /**
   * @openapi
   * /routes/template/{templateId}/signed_document_preview:
   *   get:
   *     description: 'ec__signed_document_preview'
   *     parameters:
   *       - name: templateId
   *         in: path
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__site
   *         in: query
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *
   *     responses:
   *      '200':
   *        description: 'Returns a mock of ec__signed_document to preview the template'
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              $ref: '#/components/schemas/ec__signed_document'
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'GET',
    authValidation: 'legacy',
    name: 'ec__signed_document_preview',
    path: 'template/:templateId/signed_document_preview'
  })
  static preview({ req }) {
    const { templateId } = req.params
    const { ec__site: site_id } = req.query

    const document_template = ec__document_templates.readOne(templateId)
      .expand('ec__knowledge_checks')
      .skipAcl()
      .grant('read')
      .execute()
    if (document_template.ec__pts_only) {
      faults.throw('cortex.notFound.instance')
    }

    if (site_id) {
      document_template.ec__sites = [site_id]
      const siteCursor = org.objects.c_sites.find({ _id: site_id })
        .expand('c_site_address', 'c_contacts')
        .skipAcl()
        .grant(accessLevels.read)

      if (siteCursor.hasNext() && document_template.ec__html) {
        const site = siteCursor.next()
        const siteLinkedFields = EconsentUtilities.constructSiteLinkedFields(site, document_template.ec__language)
        document_template.ec__html = DocumentProcessor.processHtmlTemplate(document_template.ec__html, siteLinkedFields)
      }
    }

    return EconsentUtilities.getDocumentPreview({ ec__document_template: document_template })
  }

  /**
   * @openapi
   * /routes/get_jwt_token_for_signed_document:
   *   get:
   *     description: 'get_jwt_token_for_signed_document'
   *     parameters:
   *
   *     responses:
   *      '200':
   *        description: 'Returns a JWT token that can be used to get the value of can_sign_document of the ec__signed_document object'
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              $ref: '#/components/schemas/ec__signed_document'
   *      '400':
   *        description: error message from exception
   */
  @route({
    weight: 1,
    method: 'GET',
    name: 'ec__signed_document_jwt_token',
    acl: 'role.c_study_participant',
    path: 'get_jwt_token_for_signed_document',
    authValidation: 'all'
  })
  @as('ec__service_user', { principal: { skipAcl: true, grant: 'read' }, safe: false })
  static getAuthToken() {
    return org.objects.accounts.createAuthToken('c_mystudy', script.principal, {
      scope: [
        'object.read.ec__signed_document.*.ec__can_sign_document'
      ],
      policy: [
        {
          method: 'GET'
        }
      ]
    })
  }

  @log({ traceResult: true, traceError: true })
  @trigger('create.before', { object: 'ec__document_template', weight: 1 })
  @as('c_system_user', { safe: false, principal: { skipAcl: true, grant: 'update' } })
  static templateBeforeCreate({ new: newTemplate, context }) {
    const templateTitle = EconsentUtilities.removeDuplicateSpaces(newTemplate.ec__title)
    if (newTemplate.ec__committee_approved_version) {
      const status = context.read('ec__status')
      if (status === 'published') faults.throw('econsent.validationError.committeeApprovedVersionUnpublished')
    }

    if (script.arguments.new.ec__signer_roles) {
      const numParticipantRoles = script.arguments.new.ec__signer_roles.reduce((a, v) => ['participant', 'non-signing participant'].includes(v.ec__signer_type) ? a + 1 : a, 0)
      if (numParticipantRoles > 1) {
        faults.throw('econsent.validationError.oneParticipantPerTemplate')
      }
    }

    if (EconsentLibrary.isDuplicateTitle(templateTitle)) {
      faults.throw('econsent.validationError.duplicateTemplateTitle')
    }

    const study = c_studies.find()
      .skipAcl()
      .grant(accessLevels.read)
      .next()
    const defaultDoc = ec__default_document_css.find()
      .skipAcl()
      .grant(accessLevels.read)
      .paths('ec__css_file')
      .next()

    const update = {
      ec__title: templateTitle
    }

    if (newTemplate.ec__pts_only === true) {
      update.ec__signer_roles = [
        {
          ec__order: 1,
          ec__required: true,
          ec__role: 'Participant',
          ec__signer_type: 'participant'
        }
      ]
    }

    if (!script.arguments.new.ec__assets || script.arguments.new.ec__assets.length === 0) {
      if (defaultDoc.ec__css_file) {
        update.ec__assets = [
          {
            ec__file: {
              content: `facet://${defaultDoc.ec__css_file.path}`
            },
            ec__filename: 'default_doc_style.css',
            ec__type: 'css'
          }
        ]
      }
    }

    if (_.isEmpty(script.arguments.new.ec__study)) {
      update.ec__study = study._id
    }

    if (_.isEmpty(script.arguments.new.ec__identifier)) {
      update.ec__identifier = EconsentUtilities.getNextTemplateID()
    }

    if (script.arguments.new.ec__pts_document) {
      update.ec__pts_set = true
    }

    if (Object.keys(update).length) {
      script.arguments.new.update(update, { grant: accessLevels.delete })
    }
  }

  @log({ traceResult: true, traceError: true })
  @trigger('update.before', {
    object: 'ec__document_template',
    weight: 1,
    if: {
      $and: [
        {
          $gte: [
            {
              $indexOfArray: [
                '$$SCRIPT.arguments.modified',
                'ec__status'
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
                'ec__version'
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
                'ec__published'
              ]
            },
            0
          ]
        },
        {
          $ne: [
            { $cache: { $concat: [LinkedFields.KEYS.PUBLISH, '$ROOT._id'] } },
            true
          ]
        }
      ]
    }
  })
  static templateBeforeStatusUpdate({ context }) {

    if (script.arguments.new.ec__status) {
      if (script.arguments.new.ec__status === 'published' && script.arguments.old.ec__status === 'archived') {
        faults.throw('econsent.validationError.cannotPublishArchivedTemplate')
      }

      if (script.arguments.new.ec__status === 'draft' && script.arguments.old.ec__status !== 'draft') {
        faults.throw('econsent.invalidArgument.templateCannotRevertToDraft') // temlates cannot go back to draft from another status
      }

      if (script.arguments.new.ec__status === 'published' && script.arguments.old.ec__status === 'draft') {
        EconsentTemplateRoutes.publishTemplate(context)
      }

    }

    if (script.arguments.old.ec__status !== 'draft') {
      // we can update status if modified includes (ec__status and hist) OR ec__status
      if (!(_.isEqual(script.arguments.modified, ['hist'])) && !(_.difference(script.arguments.modified, ['ec__status', 'hist'])).length) {
        return
      }
      // we can update sites
      if ((script.arguments.modified.length === 1 && script.arguments.modified.includes('ec__sites'))) {
        return
      }

      faults.throw('econsent.validationError.cannotEditPublishedTemplate') // templates not in draft cannot be edited
    }
  }

  @log({ traceResult: true, traceError: true })
  @trigger('update.before', {
    object: 'ec__document_template',
    weight: 1,
    if: {
      $and: [
        {
          $gte: [
            {
              $indexOfArray: [
                '$$SCRIPT.arguments.modified',
                'ec__signer_roles'
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
        },
        {
          $ne: [
            { $cache: { $concat: [LinkedFields.KEYS.PUBLISH, '$ROOT._id'] } },
            true
          ]
        }
      ]
    }
  })
  static templateBeforeSignerRolesUpdate() {

    // document can only have one participant role
    if (script.arguments.new.ec__signer_roles) {
      const numParticipantRoles = script.arguments.new.ec__signer_roles.reduce((a, v) => ['participant', 'non-signing participant'].includes(v.ec__signer_type) ? a + 1 : a, 0)
      if (numParticipantRoles > 1) {
        faults.throw('econsent.validationError.oneParticipantPerTemplate')
      }
    }

    if (script.arguments.modified.includes('ec__signer_roles')) {
      const {
        arguments: {
          old: { ec__signer_roles: old_roles, ec__requested_signatures: old_requested_signatures, ec__requested_data: old_requested_data, ec__builder_data: old_builder_data },
          new: { ec__signer_roles: new_roles, ec__requested_signatures: new_requested_signatures, ec__requested_data: new_requested_data, ec__builder_data: new_builder_data }
        }
      } = script

      // All signer roles
      const role_types = (new_roles || old_roles).map(({ ec__role }) => ec__role.toLowerCase()) || []

      const all_requested_roles = []
      // Requested roles in signature component
      const requested_signatures = new_requested_signatures || old_requested_signatures
      all_requested_roles.push(...requested_signatures.map(({ ec__signer_role: signer_role }) => signer_role && signer_role.toLowerCase()))

      // Requested roles in single choice and multiple choice
      const requested_data = new_requested_data || old_requested_data || []
      const req_choice_roles = requested_data.filter(({ ec__type }) => ec__type === 'ec__text_choice')
      all_requested_roles.push(...(req_choice_roles || []).map(({ ec__signer_role }) => ec__signer_role && ec__signer_role.toLowerCase()))

      // Requested roles in text input field
      const req_input_roles = requested_data.filter(({ ec__type }) => ['ec__text', 'ec__numeric', 'ec__date', 'ec__email', 'ec__boolean', 'ec__datetime'].includes(ec__type))
      all_requested_roles.push(...(req_input_roles || []).map(({ ec__signer_role }) => ec__signer_role && ec__signer_role.toLowerCase()))

      // Requested roles in knowledgeCheck
      const { 'ck-widgets-data': old_widgets_data } = old_builder_data || {}
      const { 'ck-widgets-data': new_widgets_data } = new_builder_data || {}
      const knowledge_check_with_signer_role = (new_widgets_data || old_widgets_data || []).filter(({ type, data }) => type === 'knowledgeCheck' && data && !_.isEmpty(data.ec__signer_role))
      all_requested_roles.push(...(knowledge_check_with_signer_role || []).map(({ data }) => data && data.ec__signer_role && data.ec__signer_role.toLowerCase()) || [])

      if (Array.isArray(all_requested_roles) && all_requested_roles.length) {
        for (const role of _.unique(all_requested_roles)) {
          if (!role_types.includes(role)) {
            faults.throw('econsent.validationError.templateSignerRoleInUse')
          }
        }
      }
    }
  }

  @log({ traceResult: true, traceError: true })
  @trigger('update.before', {
    object: 'ec__document_template',
    weight: 1,
    if: {
      $and: [
        {
          $or: [
            {
              $gte: [
                {
                  $indexOfArray: [
                    '$$SCRIPT.arguments.modified',
                    'ec__committee_approved_version'
                  ]
                },
                0
              ]
            },
            {
              $gte: [
                {
                  $indexOfArray: [
                    '$$SCRIPT.arguments.modified',
                    'ec__pts_document'
                  ]
                },
                0
              ]
            },
            {
              $gte: [
                {
                  $indexOfArray: [
                    '$$SCRIPT.arguments.modified',
                    'ec__title'
                  ]
                },
                0
              ]
            }
          ]
        },
        {
          $ne: [
            { $cache: { $concat: [LinkedFields.KEYS.PUBLISH, '$ROOT._id'] } },
            true
          ]
        }
      ]
    }
  })
  static templateBeforeUpdate({ new: newTemplate, context }) {

    if (newTemplate.ec__committee_approved_version) {
      const status = context.read('ec__status')
      if (status === 'published') faults.throw('econsent.validationError.committeeApprovedVersionUnpublished')
    }

    if (script.arguments.modified.includes('ec__pts_document')) {
      // ec__pts_set is set based on the existance of ec__pts_document
      script.arguments.new.update({ ec__pts_set: !!script.arguments.new.ec__pts_document }, { grant: accessLevels.delete })

    }

    if (script.arguments.modified.includes('ec__title')) {
      const templateTitle = EconsentUtilities.removeDuplicateSpaces(newTemplate.ec__title)
      if (EconsentLibrary.isDuplicateTitle(templateTitle)) {
        faults.throw('econsent.validationError.duplicateTemplateTitle')
      }
      script.arguments.new.update({ ec__title: templateTitle }, { grant: accessLevels.delete })
    }

  }

  @log({ traceResult: true, traceError: true })
  @trigger('update.after', {
    object: 'ec__document_template',
    weight: 1,
    if: {
      $and: [
        {
          $or: [
            {
              $gte: [
                {
                  $indexOfArray: [
                    '$$SCRIPT.arguments.modified',
                    'ec__status'
                  ]
                },
                0
              ]
            },
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
        },
        {
          $ne: [
            { $cache: { $concat: [LinkedFields.KEYS.PUBLISH, '$ROOT._id'] } },
            true
          ]
        }
      ]
    }
  })
  static afterTemplateUpdate({ modified, new: { _id, ec__sites: new_ec__sites = [], ec__status: new_ec__status }, old: { ec__sites: old_ec__sites = [], ec__status: old_ec__status } }) {

    const ec__status = new_ec__status || old_ec__status

    if ((modified.includes('ec__status') || modified.includes('ec__sites')) && ['published', 'archived'].includes(ec__status)) {

      const sites = _.unique([...(old_ec__sites), ...(new_ec__sites)])

      return org.objects.bulk()
        .add(
          c_sites.find({ _id: { $in: sites } })
            .paths('_id')
            .skipAcl()
            .grant(consts.accessLevels.read), { wrap: false }
        )
        .transform({ autoPrefix: true, script: 'ec__sites_template_update' })
        .async()
        .next()
    }
  }

  @log({ traceResult: true, traceError: true })
  static publishTemplate(context) {
    EconsentUtilities.validatePlaceholdersInHtml(script.arguments)

    const update = {
      ec__published: moment()
        .toISOString(),
      ec__version: TemplateVersionManager.getNextMajorVersion(script.arguments.old)
    }

    if (
      ((context.read('ec__html') || '').match(/\[\[\s*(\w+)\s*\]\]/g) || []).length
    ) {
      // ECO-192 keep the template status as draft. Once LFs are generated successfully update the status to "published"
      script.arguments.new.update({ ec__status: 'draft' }, { grant: accessLevels.delete })
      script.fire(
        'ec__start_generating_fields',
        { ec__document_template: context._id, ec__language: context.read('ec__language'), fields, status: context.read('ec__status'), sites: context.read('ec__sites'), update }
      )
    } else {
      script.arguments.new.update(update, { grant: accessLevels.delete })
    }

  }

}

module.exports = EconsentTemplateRoutes