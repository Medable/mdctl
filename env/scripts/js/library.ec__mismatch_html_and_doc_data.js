import { trigger, log, job, on } from 'decorators'
import config from 'config'
import logger from 'logger'

export class MismatchHtmlTemplateData {

  @trigger('update.after', {
    object: 'ec__document_template',
    weight: 1,
    inline: true,
    if: {
      $gte: [{
        $indexOfArray: [
          '$$SCRIPT.arguments.modified',
          'ec__html'
        ]
      }, 0]
    }
  })
  static afterTemplateUpdate({ new: updates }) {
    console.log('Review template after update:', updates._id)
    logger.debug('Review template after update:', updates._id)
    const template = org.objects.ec__document_template.readOne({ _id: updates._id })
      .paths(
        'ec__builder_data',
        'ec__assets',
        'ec__html',
        'ec__knowledge_checks',
        'ec__requested_data',
        'ec__requested_signatures'
      )
      .execute()

    MismatchHtmlTemplateData.fixTemplate(template)
  }

  @log({ traceError: true })
  @on('ec__review_mismatch_templates_data')
  @job('0 0 * * *', {
    name: 'ec__fix_mismatch_templates'
  })
  static fixMismatchTemplatesData() {
    if (config.get('ec__mismatch_templates_reviewed')) {
      logger.debug('Templates mismatch already reviewed. Job will not execute.')
      return console.log('Templates mismatch already reviewed. Job will not execute.')
    }

    const count = org.objects.ec__document_template.find()
      .count()

    script.fire('ec__request_review_templates', {
      skip: 0,
      limit: 100,
      count
    })
  }

  @on('ec__request_review_templates')
  static requestReviewTemplates({ skip, limit, count }) {
    if (Number(skip) >= Number(count)) {
      config.set('ec__mismatch_templates_reviewed', true)
      console.log('All templates are reviewed.')
      logger.debug('All templates are reviewed.')
    } else {
      script.fire('ec__review_templates', {
        skip,
        limit,
        count
      })
    }
  }

  @on('ec__review_templates')
  static reviewTemplates({ skip, limit, count }) {
    console.log('Reviewing templates:', { skip, limit, count })
    logger.debug('Reviewing templates:', { skip, limit, count })
    try {
      org.objects.ec__document_template.find()
        .skip(skip)
        .limit(limit)
        .paths(
          'ec__builder_data',
          'ec__assets',
          'ec__html',
          'ec__knowledge_checks',
          'ec__requested_data',
          'ec__requested_signatures'
        )
        .map(MismatchHtmlTemplateData.fixTemplate)
    } catch (err) {
      console.error(`Error while reviewing mismatched templates: skip(${skip}) | limit(${limit}).`, err)
      logger.error(`Error while reviewing mismatched templates: skip(${skip}) | limit(${limit}).`, err)
    } finally {
      script.fire('ec__request_review_templates', {
        skip: skip + limit,
        limit,
        count
      })
    }
  }

  static fixTemplate(template) {
    const {
      _id,
      ec__builder_data = {},
      ec__html = '',
      ec__requested_data = [],
      ec__requested_signatures = [],
      ec__knowledge_checks: {
        data: knowledgeChecks
      } = { data: [] }
    } = template
    try {
      MismatchHtmlTemplateData.removeUnusedAssets(template)

      if (!ec__builder_data) {
        logger.debug('No builder data for template:', _id)
        return console.log('No builder data for template:', _id)
      }

      const mismatchedData = ec__requested_data.filter(({ ec__key }) => !ec__html.includes(ec__key))
      const mismatchedSignatures = ec__requested_signatures.filter(({ ec__key }) => !ec__html.includes(ec__key))
      const mismatchedKnowledgeChecks = knowledgeChecks.filter(({ ec__key }) => !ec__html.includes(ec__key))
      if (!mismatchedData.length && !mismatchedKnowledgeChecks.length && !mismatchedSignatures.length) {
        logger.debug('Found no broken widgets! All are good! template:', _id)
        return console.log('Found no broken widgets! All are good! template:', _id)
      }

      logger.debug('Found some broken widgets! Fixing template:', _id)
      console.log('Found some broken widgets! Fixing template:', _id)

      const update = {
        $remove: {
          ec__requested_data: mismatchedData.map(({ _id }) => String(_id)),
          ec__requested_signatures: mismatchedSignatures.map(({ _id }) => String(_id))
        },
        $set: {
          ec__builder_data: {
            'ck-widgets-data': ec__builder_data['ck-widgets-data'].filter(
              ({ id: wId }) => ![
                ...mismatchedData.map(({ ec__key }) => String(ec__key)),
                ...mismatchedSignatures.map(({ ec__key }) => String(ec__key)),
                ...mismatchedKnowledgeChecks.map(({ ec__key }) => String(ec__key))
              ].includes(String(wId))
            )
          }
        }
      }

      org.objects.ec__knowledge_checks.deleteMany({ _id: { $in: mismatchedKnowledgeChecks.map(({ _id }) => _id) } })
        .skipAcl()
        .grant('delete')
        .execute()
      return org.objects.ec__document_template.updateOne(
        { _id },
        update
      )
        .lean(false)
        .execute()
    } catch (err) {
      console.error('Error reviewing template:', _id, err)
      logger.error('Error reviewing template:', _id, err)
    }
  }

  static removeUnusedAssets(template, allFiles = false) {
    try {
      const {
        ec__assets: assets,
        ec__html: html = ''
      } = template
      if (!Array.isArray(assets)) {
        return []
      }
      if (html.match(/<img\s+data-status="uploading">/)) {
        // if the template html includes uploading image tags then don't attempt
        // to remove any assets in case a newly uploaded image is removed
        return []
      }
      const matchResult = html.match(/data-uuid="([^"]+)"/gm) || []
      const usedAssetKeys = matchResult.map(item => item.slice(11, -1))
      const unusedAssetIds = assets.filter(asset => (
        asset.ec__type === 'image' &&
        (allFiles || asset.ec__file.state === 2) &&
        !usedAssetKeys.includes(String(asset.ec__key))
      ))
        .map(asset => asset._id)
      if (unusedAssetIds.length > 0) {
        org.objects.ec__document_template.updateOne(
          { _id: template._id },
          { $pull: { ec__assets: unusedAssetIds } }
        )
          .grant('delete')
          .execute()
      }
      return unusedAssetIds
    } catch (err) {
      const { _id } = template
      console.error('Error removing unused assets:', _id, err)
      logger.error('Error removing unused assets:', _id, err)
    }
  }

  /**
   * Prune unused assets from a template if it's in draft status
   * @param {string} templateId - The template ID to prune assets from
   * @param {boolean} allFiles - Whether to prune all files or only state = 2 files
   * @returns {Array} Array of removed asset IDs or empty array
   */
  static pruneUnusedAssetsIfDraft(templateId, allFiles = false) {
    try {
      const cursor = org.objects.ec__document_template.find({
        _id: templateId,
        ec__status: 'draft'
      })
        .paths('ec__status', 'ec__assets', 'ec__html')
        .skipAcl()
        .grant(consts.accessLevels.read)

      if (!cursor.hasNext()) {
        return []
      }
      const template = cursor.next()

      return MismatchHtmlTemplateData.removeUnusedAssets(template, allFiles)
    } catch (err) {
      console.error('Error in pruneUnusedAssetsIfDraft:', templateId, err)
      logger.error('Error in pruneUnusedAssetsIfDraft:', templateId, err)
      return []
    }
  }

}