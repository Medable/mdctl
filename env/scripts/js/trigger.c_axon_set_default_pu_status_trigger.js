import logger from 'logger'
import _ from 'underscore'

const c_subject_status_list = [
  { c_status_value: 'new', c_status_description: 'Subject has been created', c_default: true },
  { c_status_value: 'consented', c_status_description: 'Subject has been assigned an subject ID', c_default: false },
  { c_status_value: 'complete', c_status_description: 'Subject has completed the study', c_default: false }]

const c_subject_enrollment_status = 'consented'

_.isEmpty(script.arguments.new.c_subject_status_list) && script.arguments.new.update({ c_subject_status_list }, { grant: consts.accessLevels.delete })

_.isEmpty(script.arguments.new.c_subject_enrollment_status) && script.arguments.new.update({ c_subject_enrollment_status }, { grant: consts.accessLevels.delete })

_.isEmpty(script.arguments.new.c_supported_locales) && script.arguments.new.update({
  c_supported_locales: [org.objects.org.find()
    .next().locale]
}, { grant: consts.accessLevels.delete })

const c_patient_app_display_options = script.arguments.new.c_patient_app_display_options,
      c_no_pii = script.arguments.new.c_no_pii

if (_.isEmpty(c_patient_app_display_options.c_profile_fields) && !c_no_pii) {
  c_patient_app_display_options.c_profile_fields = [
    'c_account.name',
    'c_account.email',
    'c_account.dob',
    'c_account.mobile',
    'c_account.gender'
  ]

  script.arguments.new.update({ c_patient_app_display_options }, { grant: consts.accessLevels.delete })
}