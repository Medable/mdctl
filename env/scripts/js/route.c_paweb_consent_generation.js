/***********************************************************

@script     Patient App Web - Consent Generation

@brief      Triggers a Cortex rendering Job for transforming the (consent) HTML provided into PDF.
            It also handles uploading that PDF file into the file property that's supposed to hold it.

@route      POST routes/paweb_consent_generation

@body       * consentResponseId: id of the c_task_response instance for which the consent is being generated.
            * htmlTemplate: the signed consent document in HTML format.

@returns    * jobId: the id of the rendering job, which can be used to later check its status

@author     Nicolas Ricci

@version    4.10.0

(c)2020 Medable, Inc.  All Rights Reserved.

***********************************************************/

/**
 * @openapi
 * /paweb_consent_generation:
 *  post:
 *    description: "Triggers a Cortex rendering Job for transforming the (consent) HTML provided into PDF. It also handles uploading that PDF file into the file property that's supposed to hold it."
 *    requestBody:
 *      description:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            properties:
 *              consentResponseId:
 *                type: string
 *                description: id of the c_task_response instance for which the consent is being generated
 *              htmlTemplate:
 *                type: string
 *                description: the signed consent document in HTML format
 *
 *    responses:
 *      '200':
 *        description: "returns jobId: the id of the rendering job, which can be used to later check its status"
 */

import axonLib from 'c_axon_script_lib'
import faults from 'c_fault_lib'

const { body: { consentResponseId, htmlTemplate } } = require('request')

if (!consentResponseId) {
  faults.throw('axon.invalidArgument.validConsentIdRequired')
}

if (!htmlTemplate) {
  faults.throw('axon.invalidArgument.htmlTemplateRequired')
}

const reviewStepCursor = org.objects.c_step_response
  .find({ c_task_response: consentResponseId, type: 'c_consent_review' })
  .skipAcl(true)
  .grant(consts.accessLevels.read)

if (!reviewStepCursor.hasNext()) {
  faults.throw('axon.invalidArgument.validConsentIdRequired')
}

const { _id, c_task: { _id: taskId } } = reviewStepCursor.next()

return script.as('c_system_user', {}, () => {

  org.objects.c_step_response
    .updateOne({ _id }, { $set: { c_file: { content: `${taskId}_signed_consent.pdf` } } })
    .skipAcl(true)
    .grant(consts.accessLevels.update)
    .execute()

  // Do the actual rendering
  const { Job } = require('renderer'),
        pdfJob = new Job(axonLib.getAppKey())

  return pdfJob
    .addTemplate('htmlTemplate', htmlTemplate)
    .addOutput('consentFile', 'pdf', ['htmlTemplate'])
    .addFileTarget(`c_step_response/${_id}/c_file`, {
      facets: {
        content: 'consentFile'
      }
    })
    .start()
})