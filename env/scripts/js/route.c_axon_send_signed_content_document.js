import notifications from 'notifications';
import objects from 'objects';
import request from 'request';
import faults from 'c_fault_lib'


if(request.query.c_account && (script.principal._id.toString() !== request.query.c_account)) {
    faults.throw('axon.error.forbidden')
}

const participant = request.query.c_account ? request.query.c_account : request.query.c_public_user

if (!participant) {
  faults.throw('axon.invalidArgument.accountOrSubjectRequired')
}

const c_step_response = request.query.c_step_response

if (c_step_response) {
  const stepResponse = org.objects.c_step_responses
    .find({ _id: c_step_response })
    .next()

  if ((stepResponse.c_account._id.toString() !== participant) && (stepResponse.c_public_user._id.toString() !== participant)) {
    faults.throw('axon.error.forbidden')
  }

  if (stepResponse.type !== 'c_consent_review') {
    faults.throw('axon.invalidArgument.mustBeConsentReview')
  }

  if (stepResponse.c_file && stepResponse.c_file.path) {
    let filePath = stepResponse.c_file.path.split('/')
    filePath.splice(0, 2)
    filePath = filePath.join('/')
    const doc = objects.read('c_step_responses', filePath)
    notifications.send('c_send_signed_doc', { doc: doc }, { recipient: participant })
    return 'Email sent'
  } else {
    faults.throw('axon.invalidArgument.noDocInStepResponse')
  }
} else {
  faults.throw('axon.invalidArgument.validStepResponseRequired')
}

return 'No email sent.'