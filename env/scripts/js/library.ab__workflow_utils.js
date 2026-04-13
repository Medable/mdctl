import logger from 'logger'

export function activityWorkflowData() {
  const { objects: { ab__workflow_configuration: ExtConfiguration } } = org
  const { c_data } = ExtConfiguration.readOne({ c_key: 'ab__activity_workflow_data' }).skipAcl().grant('read').execute()
  return c_data || {}
}

export function setDynamicVRSPatientFlag(publicUserID, taskKey, taskName) {
  let EcoaCustomizationLibrary
  try {
    const ecoaLib = require('ecoa__customization_lib')
    EcoaCustomizationLibrary = ecoaLib.EcoaCustomizationLibrary
  } catch (e) {
    logger.error('ecoa__customization_lib not available, skipping dynamic VRS patient flag update')
    return
  }
  const task = org.objects.c_task.find({ c_key: taskKey })
    .expand('c_steps')
    .paths('c_name', 'c_data_labels.variables_config', 'c_key', 'c_steps.c_screen_details')
    .toArray()[0]
  const variableConfig = task.c_data_labels.variables_config
  if (!variableConfig) {
    logger.error(`Variable config not found for task: ${taskKey}`)
    return
  }
  const dynamicVRSStep = task.c_steps.data.find(step => step.c_screen_details.c_screen_type === 'vrs' && step.c_screen_details.c_screen_data.choices_variable)
  if (!dynamicVRSStep) {
    logger.error(`Dynamic VRS step not found for task: ${taskKey}`)
    return
  }
  const choicesVariable = dynamicVRSStep.c_screen_details.c_screen_data.choices_variable
  try {
    const body = () => ({
      metadata: {
          participantId: publicUserID
      },
      variables_config: variableConfig
    })
    const response = EcoaCustomizationLibrary.handleEcoaCustomizationRequest({ body })
    const eventListEmpty = response.variables[choicesVariable].length === 0
    const dynamicVRSPatientFlagIdentifier = `${taskName} Dynamic VRS Empty Event List`
    const dynamicVRSPatientFlagId = org.objects.c_patient_flag.find({ c_identifier: dynamicVRSPatientFlagIdentifier }).paths('_id').toArray()[0]._id
    const setPatientFlags = org.objects.c_public_user.find({ _id: publicUserID}).paths('c_set_patient_flags')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()[0].c_set_patient_flags
    const patientFlagAssignment = setPatientFlags.find(pf => pf.c_identifier === dynamicVRSPatientFlagIdentifier)
    script.fire('c_flags_did_change', publicUserID, [dynamicVRSPatientFlagId])
    if (patientFlagAssignment) {
      org.objects.c_public_user.updateOne({ _id: publicUserID }, {
        $set: {
          c_set_patient_flags: [
            {
              _id: patientFlagAssignment._id,
              c_enabled: eventListEmpty
            }
          ]
        }
      })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    } else {
      org.objects.c_public_user.updateOne(
        { _id: publicUserID },
        {
          $push: {
            c_set_patient_flags: [
              {
                c_enabled: eventListEmpty,
                c_flag: dynamicVRSPatientFlagId,
                c_identifier: dynamicVRSPatientFlagIdentifier
              }
            ]
          },
          $set: {
            c_events_generating: true
          }
        }
      )
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }
  } catch (e) {
    logger.error('Error while updating dynamic VRS patient flag', e)
  }
}

export function unsetDynamicVRSPatientFlag(publicUserID, taskName) {
  try {
    const dynamicVRSPatientFlagIdentifier = `${taskName} Dynamic VRS Empty Event List`
    const dynamicVRSPatientFlagId = org.objects.c_patient_flag.find({ c_identifier: dynamicVRSPatientFlagIdentifier }).paths('_id').toArray()[0]._id
    const setPatientFlags = org.objects.c_public_user.find({ _id: publicUserID}).paths('c_set_patient_flags')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()[0].c_set_patient_flags
    const patientFlagAssignment = setPatientFlags.find(pf => pf.c_identifier === dynamicVRSPatientFlagIdentifier)

    if (patientFlagAssignment) {
      script.fire('c_flags_did_change', publicUserID, [dynamicVRSPatientFlagId])
      org.objects.c_public_user.updateOne({ _id: publicUserID }, {
        $set: {
          c_set_patient_flags: [
            {
              _id: patientFlagAssignment._id,
              c_enabled: false
            }
          ],
          c_events_generating: true
        }
      })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }
  } catch (e) {
    logger.error('Error while unsetting dynamic VRS patient flag', e)
  }
}