import moment from 'moment'
import validator from 'c_axon_assets_validation_library'
import faults from 'c_fault_lib'
import _ from 'underscore'
import { id } from 'util'
import { object, trigger, log } from 'decorators'

@object('org')
// eslint-disable-next-line no-undef
class OrgLibrary extends CortexObject {

  // @log({ traceError: true })
  // @trigger('update.before', { weight: 1 })
  // static beforeUpdateOrg({ new: newOrg }) {
  //   OrgLibrary.validateAccountsConfig(newOrg)
  // }

  static validateAccountsConfig(newOrg) {
    const {
      enableEmail,
      requireEmail,
      enableUsername,
      requireUsername
    } = newOrg.configuration.accounts
    const studyCursor = org.objects.c_study
      .find()
      .skipAcl()
      .grant(consts.accessLevels.read)
    if (!studyCursor.hasNext()) {
      return
    }
    const study = studyCursor.next()

    switch (study.c_login_identifier) {
      case 'email': {
        if (
          !enableEmail ||
          !requireEmail ||
          enableUsername ||
          requireUsername
        ) {
          faults.throw('axon.validationError.orgAccountsLoginConfig')
        }
        break
      }

      case 'username': {
        if (
          enableEmail ||
          requireEmail ||
          !enableUsername ||
          !requireUsername
        ) {
          faults.throw('axon.validationError.orgAccountsLoginConfig')
        }
        break
      }
    }
  }

}

module.exports = OrgLibrary