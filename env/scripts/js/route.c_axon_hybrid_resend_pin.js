import moment from 'moment'
import request from 'request'
import notifications from 'notifications'
import faults from 'c_fault_lib'
import { getPatientAppWebURL } from 'c_axon_script_lib'
import phone from 'phone'

const { c_email, c_mobile } = request.body,
      { c_public_users, c_studies, orgs } = org.objects,
      // eslint-disable-next-line no-useless-escape
      emailValidationRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/

if (c_email && !emailValidationRegex.test(c_email)) {
  faults.throw('axon.invalidArgument.validEmailRequired')
}

const search = {}
if (c_email) {
  search.c_email = c_email.toLowerCase()
}

if (c_mobile) {
  // will throw an error in invalid number
  phone.validate(c_mobile)
  search.c_mobile = c_mobile
}

const puCursor = c_public_users.find(search)
  .skipAcl()
  .grant(consts.accessLevels.read)
  .expand('c_study')
if (!puCursor.hasNext()) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}
const pu = puCursor.next(),
      studyCursor = pu && c_studies.find({ _id: pu.c_study._id })
        .skipAcl()
        .grant(consts.accessLevels.read)
if (!studyCursor.hasNext()) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}
const study = studyCursor.next(),
      now = moment(),
      locale = (pu && pu.c_locale) || orgs.find()
        .skipAcl()
        .grant(consts.accessLevels.read)
        .next().locale

const paweb_url = getPatientAppWebURL()

// If the invite or the pin are expired, then the specific notification is sent to that effect

// the pin is sent again to the email, mobile, or both.
if (pu && pu.c_invite && pu.c_invite !== 'none' && pu.c_invite !== 'expired') {
  if (validatePinExpiry(study)) {
    if (c_email) {
      notifications.send('c_axon_invite-pin_only', { email: pu.c_email, study_name: study.c_name, access_code: pu.c_access_code, paweb_url }, { recipient: pu.c_email, locale })
    }
    if (c_mobile) {
      script.as('c_system_user', { safe: false }, () => {
        notifications.send(
          {
            mobile: c_mobile,
            study_name: study.c_name,
            access_code: pu.c_access_code,
            paweb_url
          },
          {
            endpoints: {
              sms: { mobile: c_mobile, template: 'c_axon_sms-invite_users' }
            },
            locale
          }
        )
      })
    }
  }
} if (pu && pu.c_invite && pu.c_invite === 'expired' && !pu.c_account) {
  if (c_email) {
    notifications.send('c_axon_invite-expired', { email: pu.c_email, study_name: study.c_name, paweb_url }, { recipient: pu.c_email, locale })
  }
  if (c_mobile) {
    script.as('c_system_user', { safe: false }, () => {
      notifications.send(
        {
          email: pu.c_email,
          study_name: study.c_name,
          access_code: pu.c_access_code,
          paweb_url
        },
        {
          endpoints: {
            sms: { mobile: c_mobile, template: 'c_axon_sms-invite_expired' }
          },
          locale
        }
      )
    })
  }
}

return true

function validatePinExpiry(study) {
  if (study.c_invite_code_ttl === -1) {
    return true
  }
  if (pu.c_pin_expiry_time) {
    if (new Date()
      .getTime() > new Date(pu.c_pin_expiry_time)
      .getTime()) {
      if (c_email) {
        notifications.send('c_axon_invite-pin_expired', { email: pu.c_email, study_name: study.c_name, access_code: pu.c_access_code, paweb_url }, { recipient: pu.c_email, locale })
      }
      if (c_mobile) {
        notifications.send(
          {
            email: pu.c_email,
            study_name: study.c_name,
            access_code: pu.c_access_code,
            paweb_url
          },
          {
            endpoints: {
              sms: { mobile: c_mobile, template: 'c_axon_sms-pin_expired' }
            },
            locale
          }
        )
      }
      return false
    }
  }
  return true
}