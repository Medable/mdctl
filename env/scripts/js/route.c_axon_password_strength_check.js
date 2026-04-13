/***********************************************************

@script     Axon - Password Strength Check

@brief      Route for determining the strength of a password
            and returns suggestions when it does not meet
            minimum password strength

@author     Tim Smith     (Medable.TRS)

@version    4.5.1         (Medable.TRS)

(c)2016-2018 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import request from 'request'
import z from 'zxcvbn'
import faults from 'c_fault_lib'
const i18n = require('i18n')

if (request.body.password === '' || !(typeof request.body.password === 'string' || request.body.password instanceof String)) {
  faults.throw('axon.invalidArgument.passwordValidString')
}

const feedbackTranslations = i18n.translate('passwordFeedback', { namespace: 'axon', locale: 'en_US', returnObjects: true })

const getFeedbackTranslation = (str, locale) => {

  const key = Object.keys(feedbackTranslations)
    .find(key => feedbackTranslations[key] === str)
  const local_translation = i18n.translate(`passwordFeedback.${key}`, { namespace: 'axon', locale })
  return local_translation || str

}

const translateFeedback = (feedback, locale) => {
  if (feedback && feedbackTranslations) {
    if (feedback.suggestions) {
      feedback.suggestions = feedback.suggestions.map(v => getFeedbackTranslation(v, locale))
    }

    if (feedback.warning) {
      feedback.warning = getFeedbackTranslation(feedback.warning, locale)
    }
  }
  return feedback
}
const { password } = request.body
const { minPasswordScore } = org.objects.org.find({ _id: script.org._id })
  .skipAcl(true)
  .grant(4)
  .next().configuration
let { score, feedback } = z(password)
const isValid = score >= minPasswordScore

feedback = translateFeedback(feedback, script.locale)

return { isValid, password, minPasswordScore, score, feedback }