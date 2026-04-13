import {
  transform,
  log
} from 'decorators'
import cache from 'cache'
import _ from 'lodash'
import faults from 'c_fault_lib'
import logger from 'logger'
import config from 'config'
import EconsentUtilities from 'ec__econsent_utilities_lib'

const fields = config.get('ec__linked_fields_config')
const { ec__linked_field: linkedFieldsModel, c_sites } = org.objects

@transform('c_generate_linked_field_transform')
class GenerateLFsTransform {

  each(site, { ec__document_template, ec__language }) {
    if (GenerateLFsTransform.siteHasLinkedFields(site._id, ec__document_template)) return

    EconsentUtilities.validateSiteFields(site, ec__language)

    const lfs = EconsentUtilities.constructSiteLinkedFields(site, ec__language)

    GenerateLFsTransform.insertLinkedFields({ lfs, _id: site._id, ec__document_template })

    console.log('Generate for site', { _id: site._id })
  }

  static siteHasLinkedFields(_id, ec__document_template) {
    const cursor = linkedFieldsModel.find({
      ec__document_template,
      ec__site: {
        $in: [_id]
      }
    })
      .skipAcl()
      .grant('read')
      .paths('_id')

    return cursor.hasNext() && cursor.count() === fields.length
  }

  static insertLinkedFields({ lfs, _id, ec__document_template }) {
    const inserts = []
    for (const { ec__key, ec__placeholder } of fields) {
      const ec__value = _.get(lfs, ec__placeholder)
      inserts.push({
        ec__prop: ec__key,
        ec__site: _id,
        ec__placeholder,
        ec__document_template,
        ec__value
      })
    }

    org.objects.ec__linked_field.insertMany(inserts)
      .bypassCreateAcl()
      .grant('update')
      .execute()
  }

}

@transform('ec__sites_template_update')
class SiteTemplateUpdate {

  @log({ traceError: true })
  each(site) {
    const ec__signature_types = []
    // Find pts templates, esign templates
    const hasPts = org.objects.ec__document_templates.find(
      {
        ec__sites: site._id,
        ec__status: 'published',
        ec__pts_only: true
      })
      .skipAcl()
      .grant('read')
      .hasNext()
    if (hasPts) {
      ec__signature_types.push('pts')
    }
    const hasEsign = org.objects.ec__document_templates.find(
      {
        ec__sites: site._id,
        ec__status: 'published',
        ec__pts_only: false
      })
      .skipAcl()
      .grant('read')
      .hasNext()
    if (hasEsign) {
      ec__signature_types.push('esign')
    }
    logger.debug({ hasEsign, hasPts, ec__signature_types })
    // ec__signature_types
    c_sites.updateOne({ _id: site._id }, { $set: { ec__signature_types } })
      .skipAcl()
      .grant('update')
      .execute()
  }

}