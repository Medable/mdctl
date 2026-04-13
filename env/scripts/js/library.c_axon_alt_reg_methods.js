import NucleusUtils from 'c_nucleus_utils'
import axonLib from 'c_axon_script_lib'
import { rBool } from 'util.values'
import notifications from 'notifications'
import _ from 'underscore'
import { ValidatorsBase } from 'c_axon_alt_reg_methods_validators'
import faults from 'c_fault_lib'
import config from 'config'

const { c_public_users, c_sites, c_groups, accounts, c_tasks } = org.objects

export class AltRegMethodsLibrary {

  static getSiteFromPublicUser(publicUser) {
    if (!publicUser.c_site) {
      return undefined
    }
    const siteId = publicUser.c_site._id
    const siteCursor = c_sites.find({ _id: siteId })
      .skipAcl()
      .grant(consts.accessLevels.read)
    return siteCursor.hasNext() ? siteCursor.next() : undefined
  }

  static getPublicStudyProperties() {
    return org.objects.objects
      .find({ name: 'c_study' })
      .paths('properties.name', 'properties.acl')
      .next()
      .properties.reduce((a, v) => {
        if (v.acl && v.acl.find(acl => (acl.type === 1 && acl.target.equals('000000000000000000000001') && acl.allow === 4))) {
          a.push(v.name)
        }
        return a
      }, [])
  }

  static grantAccessToInviteUsersRoute(c_site) {
    const allowedRoles = ['Administrator', 'Site User', 'Site Investigator', 'Axon Site User', 'Axon Site Investigator'],
          // get the users roles
          roles = NucleusUtils.getUserRolesSimple(script.principal._id, c_site)
            .map(v => v.toString()),
          // get the ids of the allowed roles
          aRoleIds = allowedRoles.map(v => consts.roles[v].toString()),
          // check if the user roles are in the granted roles
          granted = aRoleIds.some(r => roles.indexOf(r) >= 0)

    if (!granted) {
      faults.throw('axon.accessDenied.routeAccessDenied')
    }
  }

  static hasAtleastOneResult(object, query) {
    return AltRegMethodsLibrary.cursorForOne(object, query)
      .paths('_id')
      .hasNext()
  }

  static cursorForOne(object, query) {
    if (query) {
      return object.find(query)
        .limit(1)
        .skipAcl()
        .grant(consts.accessLevels.read)
    } else {
      return object.find()
        .limit(1)
        .skipAcl()
        .grant(consts.accessLevels.read)
    }
  }

  static generatePinCode() {
    return axonLib.generateRandomDigitSequence(6)
  }

  static updateParticipantPinExpiry(pu, inviteCodeTtl) {
    if (inviteCodeTtl) {
      const nowMillis = new Date()
        .getTime()
      const ttlMillis = inviteCodeTtl * 60 * 1000
      pu.c_pin_expiry_time = nowMillis + ttlMillis
    }
  }

  static grantAccessToResendInviteUsersRoute(c_site) {
    const allowedRoles = ['Administrator', 'Developer', 'Site User', 'Site Investigator', 'Axon Site User', 'Axon Site Investigator'],
          // get the users roles
          roles = NucleusUtils.getUserRolesSimple(script.principal._id, c_site)
            .map(v => v.toString()),
          // get the ids of the allowed roles
          aRoleIds = allowedRoles.map(v => consts.roles[v].toString()),
          // check if the user roles are in the granted roles
          granted = aRoleIds.some(r => roles.indexOf(r) >= 0)

    if (!granted) {
      faults.throw('axon.accessDenied.routeAccessDenied')
    }
  }

}

class InviteUsersBase {

  static subjectInviteValidation = null

  static inviteParam = null

  static validateInviteParameters() {
    throw new TypeError('Pure Virtual Function Call')
  }

  static getInviteParameter(params) {
    throw new TypeError('Pure Virtual Function Call')
  }

  static processAltRegUserInvite(
    c_public_user,
    locale,
    email,
    mobile,
    username,
    c_visit_schedule,
    c_group,
    study,
    c_site
  ) {
    this.inviteParam = this.getInviteParameter({ email, mobile, username })
    // validate invite parameters.
    this.validateInviteParameters()
    const shouldStoreInviteData = rBool(study.c_store_invite_data, true)
    const inviteCodeTtl = study.c_invite_code_ttl

    // Update public user.
    if (c_public_user) {
      return this.updateParticipantInfoPinExpirySendInvite(
        c_public_user,
        locale,
        shouldStoreInviteData,
        email,
        mobile,
        username,
        c_visit_schedule,
        c_group,
        inviteCodeTtl,
        study.c_name
      )
    } else {
      return this.participantCreationUpdatePinSendInvite(
        locale,
        shouldStoreInviteData,
        email,
        mobile,
        username,
        c_visit_schedule,
        c_group,
        inviteCodeTtl,
        study,
        c_site
      )
    }
  }

  static updateParticipantInfoPinExpirySendInvite(
    c_public_user,
    locale,
    shouldStoreInviteData,
    email,
    mobile,
    username,
    c_visit_schedule,
    c_group,
    inviteCodeTtl,
    studyName
  ) {
    ValidatorsBase.validateParticipantCanBeInvited(c_public_user, locale)

    const publicUser = this.updateParticipantInfo(
      locale,
      shouldStoreInviteData,
      email,
      mobile,
      username,
      c_visit_schedule,
      c_group,
      inviteCodeTtl,
      c_public_user
    )

    this.sendInvite(
      publicUser,
      email,
      mobile,
      username,
      locale,
      studyName
    )

    const response = {
      c_public_user: publicUser._id,
      c_access_code: publicUser.c_access_code,
      email,
      mobile,
      username
    }
    return [response]
  }

  static updateParticipantInfo(
    locale,
    shouldStoreInviteData,
    email,
    mobile,
    username,
    c_visit_schedule,
    c_group,
    inviteCodeTtl,
    publicUserId
  ) {
    const publicUserUpdate = {
      c_last_invite_time: new Date()
        .toISOString(),
      c_invite: 'invited',
      c_access_code: AltRegMethodsLibrary.generatePinCode(),
      c_locale: locale
    }

    if (shouldStoreInviteData) {
      if (email) {
        publicUserUpdate.c_email = email
      }
      if (mobile) {
        publicUserUpdate.c_mobile = mobile
      }
      if (username) {
        publicUserUpdate.c_username = username
      }
    }
    if (c_visit_schedule) {
      publicUserUpdate.c_visit_schedule = c_visit_schedule
    }
    if (c_group) {
      publicUserUpdate.c_group = c_group
    }
    AltRegMethodsLibrary.updateParticipantPinExpiry(publicUserUpdate, inviteCodeTtl)

    return c_public_users.updateOne({
      _id: publicUserId
    }, {
      $set: publicUserUpdate
    })
      .skipAcl()
      .grant(consts.accessLevels.delete)
      .lean(false)
      .execute()
  }

  static sendInvite(
    publicUser,
    email,
    mobile,
    c_username,
    locale,
    studyName
  ) {

    const emailRecipient = email || publicUser.c_email
    const mobileRecipient = mobile || publicUser.c_mobile
    const username = c_username || publicUser.c_username
    const { downloadText, appleStore, googleStore } = axonLib.findMobileAppVersion()
    const { appleStore_url, googleStore_url, isChina } = axonLib.findMobileAppLinks()
    if (emailRecipient) {
      notifications.send('c_axon_invite-access_code', {
        email: this.subjectInviteValidation === 'email_pin' && emailRecipient,
        username: this.subjectInviteValidation === 'username_pin' && username,
        mobile: this.subjectInviteValidation === 'mobile_pin' && mobileRecipient,
        study_name: studyName,
        access_code: publicUser.c_access_code,
        paweb_url: axonLib.getPatientAppWebURL(),
        googleStore: googleStore && !isChina,
        appleStore,
        downloadText,
        appleStore_url,
        googleStore_url
      }, {
        locale,
        recipient: emailRecipient
      })
    }

    if (mobileRecipient) {
      notifications.send(
        {
          email: this.subjectInviteValidation === 'email_pin' && emailRecipient,
          username: this.subjectInviteValidation === 'username_pin' && username,
          mobile: this.subjectInviteValidation === 'mobile_pin' && mobileRecipient,
          study_name: studyName,
          access_code: publicUser.c_access_code,
          paweb_url: axonLib.getPatientAppWebURL()
        },
        {
          endpoints: {
            sms: { mobile: mobileRecipient, template: 'c_axon_sms-invite_users' }
          },
          locale: publicUser.c_locale
        }
      )
    }
  }

  /**
   * This callback function is needed to support batch invites
   */
  static participantCreationUpdatePinSendInvite(
    locale,
    shouldStoreInviteData,
    email,
    mobile,
    username,
    c_visit_schedule,
    c_group,
    inviteCodeTtl,
    study,
    c_site
  ) {
    const publicUser = this.createNewParticipant(
      locale,
      shouldStoreInviteData,
      email,
      mobile,
      username,
      c_visit_schedule,
      c_group,
      inviteCodeTtl,
      study,
      c_site
    )

    this.sendInvite(publicUser, email, mobile, username, locale, study.c_name)

    const response = {
      c_public_user: publicUser._id,
      c_access_code: publicUser.c_access_code,
      email,
      mobile,
      username
    }
    return [response]
  }

  static createNewParticipant(
    locale,
    shouldStoreInviteData,
    email,
    mobile,
    username,
    c_visit_schedule,
    c_group,
    inviteCodeTtl,
    study,
    c_site
  ) {
    const publicUserCreation = c_group != null
      ? {
        c_group,
        c_study: study._id,
        c_invite: 'invited',
        c_last_invite_time: new Date()
          .toISOString(),
        c_access_code: AltRegMethodsLibrary.generatePinCode(),
        c_locale: locale
      }
      : {
        c_study: study._id,
        c_invite: 'invited',
        c_last_invite_time: new Date()
          .toISOString(),
        c_access_code: AltRegMethodsLibrary.generatePinCode(),
        c_locale: locale
      }

    if (shouldStoreInviteData) {
      if (email) {
        publicUserCreation.c_email = email
      }
      if (mobile) {
        publicUserCreation.c_mobile = mobile
      }
      if (username) {
        publicUserCreation.c_username = username
      }
    }
    if (c_site) {
      publicUserCreation.c_site = c_site
    } else if (study.c_default_subject_site) {
      publicUserCreation.c_site = study.c_default_subject_site
    }
    if (c_visit_schedule) {
      publicUserCreation.c_visit_schedule = c_visit_schedule
    } else if (study.c_default_subject_visit_schedule) {
      publicUserCreation.c_visit_schedule = study.c_default_subject_visit_schedule
    }
    AltRegMethodsLibrary.updateParticipantPinExpiry(publicUserCreation, inviteCodeTtl)

    return c_public_users.insertOne(publicUserCreation)
      .skipAcl()
      .grant(consts.accessLevels.delete)
      .lean(false)
      .execute()
  }

}

class InviteUsersByEmail extends InviteUsersBase {

  static subjectInviteValidation = 'email_pin'

  static validateInviteParameters() {
    ValidatorsBase.validateRequiredParam(this.inviteParam, 'axon.invalidArgument.emailQuantityError')
  }

  static getInviteParameter({ email }) {
    return email
  }

}

class InviteUsersByMobile extends InviteUsersBase {

  static subjectInviteValidation = 'mobile_pin'

  static validateInviteParameters() {
    ValidatorsBase.validateRequiredParam(this.inviteParam, 'axon.invalidArgument.mobileNumberIsRequired')
  }

  static getInviteParameter({ mobile }) {
    return mobile
  }

}

class InviteUsersByUsername extends InviteUsersBase {

  static subjectInviteValidation = 'username_pin'

  static validateInviteParameters() {
    ValidatorsBase.validateRequiredParam(this.inviteParam, 'axon.invalidArgument.usernameIsRequired')
  }

  static getInviteParameter({ username }) {
    return username
  }

}

class InviteUsersByPinOnly extends InviteUsersBase {

  static subjectInviteValidation = 'pin_only'

  static validateInviteParameters() { }

  static getInviteParameter() {
    return null
  }

}

class StudySubjectInfoBase {

  static subjectInviteValidation = null

  static inviteParam = null
  static inviteParamName = null
  static accessCode = null
  static donnotMatchErrorCode = null
  static requiredErrorCode = null
  static requiredValidationCondition = null

  static getInviteParameterInfo(params) {
    throw new TypeError('Pure Virtual Function Call')
  }

  static processSubjectInfoRequest(
    email,
    mobile,
    username,
    accessCode,
    c_public_user,
    study,
    groups
  ) {
    this.accessCode = accessCode
    ;({ inviteParam: this.inviteParam, requiredValidationCondition: this.requiredValidationCondition } = this.getInviteParameterInfo({ email, mobile, username }))

    const publicStudyProperties = AltRegMethodsLibrary.getPublicStudyProperties()

    // Study is the only passed parameter
    if (!c_public_user && !this.accessCode && !this.inviteParam) {

      // We need a valid study ID to proceed

      if (study.c_requires_invite) {
        // tell the app an email and access code is necessary by returning the study requires invite parameter
        return { c_study: _.pick(study, '_id', 'object', 'c_requires_invite', publicStudyProperties) }
      } else {
        // no invite required, lets create a public user for the app to use

        const defaultGroup = study.c_default_subject_group || groups.find(v => v.c_name === 'All')
        if (!defaultGroup) {
          faults.throw('axon.error.allGroupNotFound')
        }

        // Now start creating a new public user
        const publicUserCreation = { c_study: study._id, c_invite: 'none', c_group: defaultGroup._id }

        if (study.c_default_subject_site) {
          publicUserCreation.c_site = study.c_default_subject_site._id
        }

        if (study.c_default_subject_visit_schedule) {
          publicUserCreation.c_visit_schedule = study.c_default_subject_visit_schedule._id
        }

        const c_public_user = c_public_users.insertOne(publicUserCreation)
          .skipAcl()
          .grant(consts.accessLevels.script)
          .lean(false)
          .execute()

        return {
          c_public_user,
          c_study: _.pick(study, '_id', 'object', 'c_requires_invite', publicStudyProperties),
          c_site: AltRegMethodsLibrary.getSiteFromPublicUser(c_public_user)
        }

      }

    } else if (this.accessCode && this.inviteParam) {
      // email and access code provided
      const publicUserCursor = c_public_users.find({ c_access_code: this.accessCode, [this.inviteParamName]: this.inviteParam })
              .skipAcl()
              .grant(consts.accessLevels.read)
              .transform({ script: 'c_invite_expiry_transform' }),
            publicUser = publicUserCursor.hasNext() && publicUserCursor.next(),
            // only get the connection if no account is attached (invite not yet accepted)
            returnData = {
              c_public_user: publicUser,
              c_study: _.pick(study, '_id', 'object', 'c_requires_invite', publicStudyProperties),
              c_site: AltRegMethodsLibrary.getSiteFromPublicUser(publicUser)
            }

      if (!publicUser) {
        faults.throw(this.donnotMatchErrorCode)
      }

      if (publicUser.c_invite === 'expired') {
        faults.throw('axon.expired.invitationExpired')
      }

      // Check if pin code has expired.

      if (study.c_invite_code_ttl !== -1) {
        if (new Date()
          .getTime() > new Date(publicUser.c_pin_expiry_time)
          .getTime()) {
          faults.throw('axon.expired.pinCodeExpired')
        }
      }

      returnData.connection = {
        _id: '000000000000000000000000',
        access: 0,
        created: '2000-01-01T00:00:00.000Z',
        object: 'connection',
        token: this.accessCode
      }

      c_public_users.updateOne({ _id: publicUser._id }, { $set: { c_invite_validated: true } })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()

      return returnData

    } else if (c_public_user) {
      // With just the public user Id, get the public user object and the related connection if it exists
      const publicUserCursor = c_public_users.find({ _id: c_public_user })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .transform({ script: 'c_invite_expiry_transform' })

      const publicUser = publicUserCursor.hasNext() && publicUserCursor.next()

      if (publicUser) {
        // only get the connection if no account is attached (invite not yet accepted)
        return {
          c_public_user: publicUser,
          c_study: _.pick(study, '_id', 'object', 'c_requires_invite', publicStudyProperties),
          c_site: AltRegMethodsLibrary.getSiteFromPublicUser(publicUser)
        }
      } else {
        faults.throw('axon.invalidArgument.subjectNotFound')
      }

    } else if (this.requiredValidationCondition) {
      // jsut to double check people aren't sending one or the other
      faults.throw(this.requiredErrorCode)
    } else {
      faults.throw('axon.invalidArgument.subjectNotFound')
    }
  }

}

class SubjectInfoRequestByEmail extends StudySubjectInfoBase {

  static subjectInviteValidation = 'email_pin'
  static inviteParamName = 'c_email'
  static donnotMatchErrorCode = 'axon.invalidArgument.emailAccessCodeDontMatch'
  static requiredErrorCode = 'axon.invalidArgument.emailAndAccessCodeRequired'

  static getInviteParameterInfo({ email }) {
    const lowerCaseEmail = email ? email.toLowerCase() : null
    return {
      inviteParam: lowerCaseEmail,
      requiredValidationCondition: (!this.accessCode && lowerCaseEmail) || (this.accessCode && !lowerCaseEmail)
    }
  }

}

class SubjectInfoRequestByMobile extends StudySubjectInfoBase {

  static subjectInviteValidation = 'mobile_pin'
  static inviteParamName = 'c_mobile'
  static donnotMatchErrorCode = 'axon.invalidArgument.mobileAccessCodeDontMatch'
  static requiredErrorCode = 'axon.invalidArgument.mobileAndAccessCodeRequired'

  static getInviteParameterInfo({ mobile }) {
    return {
      inviteParam: mobile,
      requiredValidationCondition: (!this.accessCode && mobile) || (this.accessCode && !mobile)
    }
  }

}

class SubjectInfoRequestByUsername extends StudySubjectInfoBase {

  static subjectInviteValidation = 'username_pin'
  static inviteParamName = 'c_username'
  static donnotMatchErrorCode = 'axon.invalidArgument.usernameAccessCodeDontMatch'
  static requiredErrorCode = 'axon.invalidArgument.usernameAndAccessCodeRequired'

  static getInviteParameterInfo({ username }) {
    return {
      inviteParam: username,
      requiredValidationCondition: (!this.accessCode && username) || (this.accessCode && !username)
    }
  }

}

class SubjectInfoRequestByPinOnly extends StudySubjectInfoBase {

  static subjectInviteValidation = 'pin_only'
  static inviteParamName = 'c_access_code'
  static donnotMatchErrorCode = 'axon.invalidArgument.accessCodeDontMatch'
  static requiredErrorCode = 'axon.invalidArgument.accessCodeRequired'

  static getInviteParameterInfo() {
    return {
      inviteParam: this.accessCode,
      requiredValidationCondition: !this.accessCode
    }
  }

}

export class ResendInviteLibrary {

  static sendInviteNotifications(publicUser, study, locale, c_email, c_mobile, c_study_code) {
    const paweb_url = axonLib.getPatientAppWebURL()
    const { downloadText, appleStore, googleStore } = axonLib.findMobileAppVersion()
    const { appleStore_url, googleStore_url, isChina } = axonLib.findMobileAppLinks()

    const isPAWEnabled = axonLib.isPAWEnabled()
    const inviteNotifPayload = {
      email: study.c_subject_invite_validation === 'email_pin' && publicUser.c_email,
      username: study.c_subject_invite_validation === 'username_pin' && publicUser.c_username,
      mobile: study.c_subject_invite_validation === 'mobile_pin' && publicUser.c_mobile,
      study_name: study.c_name,
      access_code: publicUser.c_access_code,
      paweb_url,
      downloadText,
      appleStore,
      googleStore: googleStore && !isChina,
      c_study_code,
      isMobileOnlyStudy: (googleStore || appleStore) && !isPAWEnabled,
      isWebOnlyStudy: !googleStore && !appleStore && isPAWEnabled,
      isMobileAndWebStudy: (googleStore || appleStore) && isPAWEnabled,
      appleStore_url,
      googleStore_url
    }
    const isNewInviteFlow = config.get('global') && config.get('global').siteapp && _.isBoolean(config.get('global').siteapp.singleAppOnboardingFlowEnabled)
      ? config.get('global').siteapp.singleAppOnboardingFlowEnabled
      : true

    if (c_email && isNewInviteFlow) {
      notifications.send('c_axon_new_participant_invite', inviteNotifPayload, { recipient: c_email, locale })
    }
    if (c_email && !isNewInviteFlow) {
      notifications.send('c_axon_invite-access_code', inviteNotifPayload, { recipient: c_email, locale })
    }
    if (c_mobile) {
      notifications.send(
        inviteNotifPayload,
        {
          endpoints: { sms: { mobile: c_mobile, template: 'c_axon_sms-invite_users' } },
          locale: publicUser.c_locale
        }
      )
    }
  }

  static processAltRegResendInvite(
    publicUser,
    study,
    c_public_user,
    storeInviteData,
    enableAltReg,
    locale,
    c_email,
    c_mobile,
    inviteCodeTtl,
    c_study_code
  ) {
    // If the user already has an account or the invite is accepted, do not update anything.
    // Simply resend the existing access code to the provided recipient(s).
    const hasAccount = !!publicUser.c_account
    const isAccepted = publicUser.c_invite === 'accepted'
    if (hasAccount || isAccepted) {
      ResendInviteLibrary.sendInviteNotifications(publicUser, study, locale, c_email, c_mobile, c_study_code)
      return [publicUser]
    }

    // update the public user as necessary
    let c_last_invite_time = new Date()
          .toISOString(),
        publicUserUpdate = { c_invite: 'invited', c_last_invite_time }

    if (locale) {
      publicUserUpdate = { ...publicUserUpdate, c_locale: locale }
    }

    const emailWasUpdated = c_email && c_email !== publicUser.c_email
    const mobileWasUpdated = c_mobile && c_mobile !== publicUser.c_mobile

    // if it was requested, we save the resent invite data
    if (storeInviteData) {
      if (emailWasUpdated) {
        publicUserUpdate.c_email = c_email
      }
      if (mobileWasUpdated) {
        publicUserUpdate.c_mobile = c_mobile
      }
    }

    const isTtlExpired = inviteCodeTtl && inviteCodeTtl > 0 && new Date()
      .getTime() > new Date(publicUser.c_pin_expiry_time)
      .getTime()

    // Update both access code & expiry date
    if (isTtlExpired || emailWasUpdated || mobileWasUpdated) {
      publicUserUpdate.c_access_code = AltRegMethodsLibrary.generatePinCode()

      if (inviteCodeTtl && inviteCodeTtl > 0) {
        const nowMillis = new Date()
          .getTime()
        const ttlMillis = inviteCodeTtl * 60 * 1000
        publicUserUpdate.c_pin_expiry_time = nowMillis + ttlMillis
      }
    }

    publicUser = c_public_users.updateOne({ _id: c_public_user }, { $set: publicUserUpdate })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .lean(false)
      .execute()

    // send notifications with the (possibly updated) publicUser data
    ResendInviteLibrary.sendInviteNotifications(publicUser, study, locale, c_email, c_mobile, c_study_code)

    return [publicUser]
  }

}

export const UserInvitationProcessors = {
  [InviteUsersByEmail.subjectInviteValidation]: InviteUsersByEmail,
  [InviteUsersByMobile.subjectInviteValidation]: InviteUsersByMobile,
  [InviteUsersByUsername.subjectInviteValidation]: InviteUsersByUsername,
  [InviteUsersByPinOnly.subjectInviteValidation]: InviteUsersByPinOnly
}

export const SubjectInfoRequestProcessors = {
  [SubjectInfoRequestByEmail.subjectInviteValidation]: SubjectInfoRequestByEmail,
  [SubjectInfoRequestByMobile.subjectInviteValidation]: SubjectInfoRequestByMobile,
  [SubjectInfoRequestByUsername.subjectInviteValidation]: SubjectInfoRequestByUsername,
  [SubjectInfoRequestByPinOnly.subjectInviteValidation]: SubjectInfoRequestByPinOnly
}