import logger from 'logger'
import _ from 'underscore'

const study = org.objects.c_study.find({ _id: script.arguments.new.c_study._id }).skipAcl().grant(consts.accessLevels.delete).next()
const defaultStatus = _(study.c_subject_status_list).filter(s => s.c_default)[0]
const defaultStatusValue = _.has(defaultStatus, 'c_status_value') && defaultStatus.c_status_value
const update = {
  c_status: defaultStatusValue
}

if (script.arguments.new.c_number) {
  update.c_enrollment_date = new Date().toISOString()
}

defaultStatusValue && script.arguments.new.update({ c_status: defaultStatusValue })