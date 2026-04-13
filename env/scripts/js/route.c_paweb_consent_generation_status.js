/***********************************************************

@script     Patient App Web - Consent Generation Status

@brief      Check the status of both, the PDF rendering job and the file property,
            so the client can know when the consent file is ready to be consumed

@route      POST routes/paweb_consent_generation_status

@body       * consentResponseId: id of the c_task_response instance for which the consent is being generated.
            * jobId: Cortex job id

@returns    "pending", "ready" or "error" depending on what the case is.

@author     Nicolas Ricci

@version    4.10.0

(c)2020 Medable, Inc.  All Rights Reserved.

***********************************************************/

/**
 * @openapi
 * /paweb_consent_generation_status:
 *  post:
 *    description: 'Check the status of both, the PDF rendering job and the file property, so the client can know when the consent file is ready to be consumed'
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
 *              jobId:
 *                type: string
 *                description: Cortex job id
 *
 *    responses:
 *      '200':
 *        description: returns "pending", "ready" or "error" depending on what the status is.
 */

import axonLib from 'c_axon_script_lib'
import faults from 'c_fault_lib'

const { query: { consentResponseId, jobId } } = require('request')

if (!consentResponseId) {
  faults.throw('axon.invalidArgument.validConsentIdRequired')
}

if (!jobId) {
  faults.throw('axon.invalidArgument.jobIdRequired')
}

const reviewStepCursor = org.objects.c_step_response
  .find({ c_task_response: consentResponseId, type: 'c_consent_review' })
  .skipAcl(true)
  .grant(consts.accessLevels.read)

if (!reviewStepCursor.hasNext()) {
  faults.throw('axon.invalidArgument.validConsentIdRequired')
}

const consentFileStatus = reviewStepCursor.next().c_file.state,
      { Job } = require('renderer'),
      pdfJob = new Job(axonLib.getAppKey()),
      jobStatus = pdfJob.status(jobId)['cortex-renderer-management-service.default.svc.cluster.local'].status

if (jobStatus !== 'Processing' && jobStatus !== 'Completed') { return 'error' }

if (consentFileStatus === 3 || consentFileStatus === 4) { return 'error' }

if (consentFileStatus === 2) { return 'ready' }

return 'pending'