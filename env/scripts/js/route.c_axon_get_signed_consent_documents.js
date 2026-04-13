import objects from 'objects'
import request from 'request'
import faults from 'c_fault_lib'

const ecConfig = require('config')
  .get('ec__version')
const findQuery = {
  type: { $in: ['c_consent', 'c_consent_review'] }
}

if (request.query.c_study) {
  findQuery['c_study._id'] = request.query.c_study
} else if (request.query.c_task) {
  findQuery['c_task._id'] = request.query.c_task
} else {
  faults.throw('axon.invalidArgument.taskOrStudyRequired')
}

if (request.query.c_account) {
  if (script.principal._id.toString() !== request.query.c_account) {
    faults.throw('axon.error.forbidden')
  }
  findQuery['c_account._id'] = request.query.c_account
} else if (request.query.c_public_user) {
  findQuery['c_public_user._id'] = request.query.c_public_user
} else {
  faults.throw('axon.invalidArgument.accountOrSubjectRequired')
}

const stepResponses = org.objects.c_step_responses
        .find(findQuery)
        .skipAcl(true)
        .grant(4)
        .limit(1000)
        .toList(),

      consents = []

stepResponses.data.forEach(ele => {
  if (ele.c_file && ele.c_file.path) {
    let filePath = ele.c_file.path.split('/')
    filePath.splice(0, 2)
    filePath = filePath.join('/')
    // const consent = objects.read('c_step_responses', filePath, { skipAcl: true, grant: 4 })
    consents.push({
      _id: ele._id,
      created: ele.created,
      // c_file: consent
      object: 'c_step_response',
      c_file: ele.c_file
    })
  }
})

if (ecConfig) {
  const ecsignedDocQuery = {}
  ecsignedDocQuery.ec__status = { $eq: 'complete' }
  ecsignedDocQuery['ec__study._id'] = { $eq: request.query.c_study }
  const signeddocs = org.objects.ec__signed_documents.find(ecsignedDocQuery)
    .include('ec__final_document')
    .toList()
  signeddocs.data
    .forEach(signedDoc => {
      consents.push({
        _id: signedDoc._id,
        object: 'ec__signed_document',
        created: signedDoc.created,
        updated: signedDoc.updated,
        c_file: signedDoc.ec__final_document
      })
    })
}
return consents