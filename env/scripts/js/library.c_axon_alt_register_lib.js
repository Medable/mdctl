import {
  route,
  log,
  as,
  policy,
  trigger
} from 'decorators'
import faults from 'c_fault_lib'
import NucleusUtils from 'c_nucleus_utils'
import notifications from 'notifications'
import axonLib from 'c_axon_script_lib'
import { sha256 } from 'crypto'

class AlternateRegisterLib {

  /**
   * @openapi
   * /reset_pin:
   *  post:
   *    description: 'reset the pin of the given public user'
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              c_public_user:
   *                type: string
   *                description: id of the c_public_user
   *
   *    responses:
   *      '200':
   *        description: the updated c_public_user
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/components/schemas/c_public_user'
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'reset_pin',
    path: 'reset_pin'
  })
  static resetPin({
    body
  }) {
    const { c_public_users, c_studies } = org.objects,
          { c_public_user: publicUserId } = body(),
          allowedRoles = ['Administrator', 'Developer', 'Site User', 'Site Investigator', 'Axon Site User', 'Axon Site Investigator']
    if (!publicUserId) {
      faults.throw('axon.invalidArgument.validSubjectRequired')
    }
    const publicUserCursor = c_public_users.find({ _id: publicUserId })
      .paths('c_site', 'c_study')
      .limit(1)
      .skipAcl()
      .grant(consts.accessLevels.read)
    if (!publicUserCursor.hasNext()) {
      faults.throw('axon.invalidArgument.validSubjectRequired')
    }
    const publicUser = publicUserCursor.next()

    // get site
    const userSite = publicUser.c_site
    if (!userSite) {
      faults.throw('axon.invalidArgument.subjectRequiredInSiteOrStudy')
    }
    const siteId = userSite._id
    // get the users roles
    const roles = NucleusUtils.getUserRolesSimple(script.principal._id, siteId)
      .map(v => v.toString())
    // get the ids of the allowed roles
    const aRoleIds = allowedRoles.map(v => consts.roles[v].toString()),
          // check if the user roles are in the granted roles
          granted = aRoleIds.some(r => roles.indexOf(r) >= 0)
    if (!granted) {
      faults.throw('axon.accessDenied.routeAccessDenied')
    }

    // get study
    const userStudy = publicUser.c_study
    if (!userStudy) {
      faults.throw('axon.invalidArgument.subjectRequiresStudy')
    }
    const studyId = userStudy._id
    const studyCursor = c_studies.find({ _id: studyId })
      .limit(1)
      .skipAcl()
      .grant(consts.accessLevels.read)
    if (!studyCursor.hasNext()) {
      faults.throw('axon.invalidArgument.subjectRequiresStudy')
    }
    const expandedStudy = studyCursor.next()
    const inviteCodeTtl = expandedStudy.c_invite_code_ttl
    const enableAltReg = expandedStudy.c_enable_alt_reg

    const publicUserUpdate = {}
    updatePinExpiry(publicUserUpdate, inviteCodeTtl)
    publicUserUpdate.c_last_invite_time = new Date()
      .toISOString()
    publicUserUpdate.c_invite = 'invited'
    publicUserUpdate.c_access_code = generatePinCode(enableAltReg)

    const updatedPublicUser = c_public_users.updateOne({ _id: publicUserId }, { $set: publicUserUpdate })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .lean(false)
      .execute()

    return updatedPublicUser
  }

  /**
   * @openapi
   * /forgot_username:
   *  post:
   *    description: 'forgot username'
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              email:
   *                type: string
   *              mobile:
   *                type: string
   *
   *    responses:
   *      '200':
   *        description: always returns true
   *        content:
   *          application/json:
   *            schema:
   *              type: boolean
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'forgot_username',
    path: 'forgot_username',
    acl: ['account.anonymous']
  })
  @as('c_system_user', { principal: { skipAcl: true, grant: consts.accessLevels.read }, acl: { safe: false }, modules: { safe: false } })
  static forgotUsername({
    body
  }) {
    const { accounts, c_studies } = org.objects
    const { email, mobile } = body()
    if (!email && !mobile) {
      faults.throw('axon.invalidArgument.forgotUsernameParams')
    }
    const search = {}
    if (email) {
      search.email = email
    }
    if (mobile) {
      search.mobile = mobile
    }
    const accountCursor = accounts.find(search)
      .limit(1)
      .skipAcl()
      .grant(consts.accessLevels.read)
    if (search.email && !accountCursor.hasNext()) {
      faults.throw('axon.invalidArgument.noAccountForEmail')
    } else if (search.mobile && !accountCursor.hasNext()) {
      faults.throw('axon.invalidArgument.noAccountForMobile')
    }
    const account = accountCursor.next()

    const studyCursor = c_studies.find()
      .limit(1)
      .skipAcl()
      .grant(consts.accessLevels.read)
    if (!studyCursor.hasNext()) {
      faults.throw('axon.invalidArgument.subjectRequiresStudy')
    }
    const study = studyCursor.next()
    if (email) {
      notifications.send(
        'c_axon_invite-forgot_username',
        {
          username: account.username,
          studyName: study.c_name
        },
        {
          recipient: email,
          locale: account.locale
        }
      )
    }

    if (mobile) {
      notifications.send(
        {
          username: account.username,
          studyName: study.c_name
        },
        {
          endpoints: {
            sms: { mobile, template: 'c_forgot-username' }
          },
          locale: account.locale
        }
      )
    }
    return true
  }

  /**
   * @openapi
   * /validate_invite:
   *  get:
   *    description: 'validate invite'
   *    parameters:
   *      - name: c_email
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: c_username
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: c_access_code
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: c_mobile
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *
   *    responses:
   *      '200':
   *        description: always returns true
   *        content:
   *          application/json:
   *            schema:
   *              type: boolean
   *      '400':
   *        description: error message
   */
  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'validate_invite',
    path: 'validate_invite',
    acl: ['account.anonymous']
  })
  static validateInvite({
    req
  }) {
    const { c_public_users, c_studies } = org.objects
    const {
      c_email,
      c_username,
      c_access_code,
      c_mobile
    } = req.query
    // load study.
    const studyCursor = c_studies.find()
      .limit(1)
      .skipAcl()
      .grant(consts.accessLevels.read)
    if (!studyCursor.hasNext()) {
      faults.throw('axon.invalidArgument.subjectRequiresStudy')
    }
    const study = studyCursor.next()
    // load subject invite validation
    const subjectInviteValidation = study.c_subject_invite_validation || 'pin_only'
    // validate the invite.
    switch (subjectInviteValidation) {
      case 'email_pin': {
        return validateUserInvite(
          c_public_users,
          'c_email',
          c_email,
          c_access_code,
          'axon.invalidArgument.emailAccessCodeDontMatch',
          'axon.invalidArgument.emailAndAccessCodeRequired',
          study
        )
      }

      case 'mobile_pin': {
        return validateUserInvite(
          c_public_users,
          'c_mobile',
          c_mobile,
          c_access_code,
          'axon.invalidArgument.mobileAccessCodeDontMatch',
          'axon.invalidArgument.mobileAndAccessCodeRequired',
          study
        )
      }

      case 'username_pin': {
        return validateUserInvite(
          c_public_users,
          'c_username',
          c_username,
          c_access_code,
          'axon.invalidArgument.usernameAccessCodeDontMatch',
          'axon.invalidArgument.usernameAndAccessCodeRequired',
          study
        )
      }

      case 'pin_only': {
        return validateUserInvite(
          c_public_users,
          'c_access_code',
          c_access_code,
          c_access_code,
          'axon.invalidArgument.accessCodeDontMatch',
          'axon.invalidArgument.accessCodeRequired',
          study
        )
      }

      default:
        return faults.throw('axon.unsupportedOperation.notImplemented')
    }
  }

  /**
   * @openapi
   * /create_participant:
   *  post:
   *    description: 'c_create_participant'
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              c_study:
   *                type: string
   *                description: id of the c_study
   *
   *    responses:
   *      '200':
   *        description: the created c_public_user
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/components/schemas/c_public_user'
   *      '400':
   *        description: error message from exception
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_create_participant',
    path: 'create_participant',
    acl: ['account.anonymous']
  })
  @as('c_system_user', { principal: { skipAcl: true, grant: consts.accessLevels.update }, acl: { safe: false }, modules: { safe: false } })
  static createParticipant({ body }) {
    const { c_public_users, c_studies, c_groups } = org.objects
    const { c_study } = body()
    let where

    if (c_study) {
      where = {
        _id: c_study
      }
    }

    const study = c_studies.find(where)
      .paths('c_name', 'c_requires_invite', 'c_default_subject_group', 'c_default_subject_site', 'c_default_subject_visit_schedule')
      .next()

    if (study.c_requires_invite) {
      faults.throw('axon.accessDenied.cannotCreateParticipantWithoutInvite')
    }

    const groups = c_groups.find({ c_study: study._id })
      .paths('c_name')
      .toArray()

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
      .execute()

    return c_public_users.readOne(c_public_user)
      .expand('c_site')
      .execute()
  }

  /**
   * @openapi
   * /accounts/request-password-reset:
   *  post:
   *    description: 'request password reset'
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              mobile:
   *                type: string
   *                description: phone number of the account
   *
   *    responses:
   *      '200':
   *        description: always returns true
   *        content:
   *          application/json:
   *            schema:
   *              type: boolean
   *      '400':
   *        description: axon.invalidArgument.mobileNotInputted
   */
  @route('POST /accounts/request-password-reset', { system: true })
  resetPasswordRequest({ req, body, next }) {
    const { Accounts } = org.objects
    const { mobile } = body()

    if (Object.keys(body())
      .includes('mobile') && mobile.length === 0) {
      faults.throw('axon.invalidArgument.mobileNotInputted')
    }
    if (mobile) {
      const account = Accounts.readOne({ mobile })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .throwNotFound(false)
        .execute()

      if (account) {
        const token = Accounts.createPasswordResetToken(account._id, { locale: account.locale || 'en_US', sendEmail: false, sendMobile: false })
        const url = `${script.env.url.replace('api', 'app')}/reset-password/${token}`

        notifications.send(
          'c_axon_lost_password',
          {
            account,
            reset: {
              url
            }
          },
          {
            recipient: account._id,
            locale: account.locale || 'en_US'
          }
        )
      }
      return true
    } else {
      next()
    }
  }

  /**
   * @openapi
   * /c_site/{siteId}/password_reset/{publicUserId}:
   *  post:
   *    description: 'c_initiate_password_reset'
   *    parameters:
   *      - name: siteId
   *        in: path
   *        required: true
   *      - name: publicUserId
   *        in: path
   *        required: true
   *
   *    responses:
   *      '200':
   *        description: returns new password
   *      '400':
   *        description: axon.accessDenied.routeAccessDenied or axon.invalidArgument.invalidObjectId
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_initiate_password_reset',
    path: 'c_site/:siteId/password_reset/:publicUserId'
  })
  static initiatePasswordReset({ req }) {
    const { accounts, c_public_users, c_sites, c_site_users } = org.objects

    const { siteId: c_site, publicUserId } = req.params
    const allowedRoles = ['Site User', 'Site Investigator', 'Axon Site User', 'Axon Site Investigator'],
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

    const { c_public_user } = validateRouteParams({
      c_sites,
      c_site,
      c_public_users,
      publicUserId
    })

    if (!c_public_user.c_account) {
      faults.throw('axon.invalidArgument.invalidObjectId')
    }

    const { minPasswordScore } = org.objects.org.find({ _id: script.org._id })
      .skipAcl(true)
      .grant(4)
      .next().configuration

    const digits = minPasswordScore < 3 ? 8 : minPasswordScore === 3 ? 10 : 16

    // generate random password
    let newPassword = axonLib.generateRandomDigitSequence(digits)
    const maxRetries = 20
    let count = 0

    script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: consts.accessLevels.update } }, () => {
      let done = false
      // some digit sequences will fail so we retry till we get one that works
      while (!done && count < maxRetries) {
        try {
          accounts.admin.update(
            c_public_user.c_account._id,
            {
              password: newPassword
            }
          )

          accounts.admin.update(
            c_public_user.c_account._id,
            {
              stats: {
                mustResetPassword: true
              }
            }
          )
          done = true
        } catch (err) {
          count++
          newPassword = axonLib.generateRandomDigitSequence(digits)
          if (count >= maxRetries) {
            throw err
          }
        }
      }
    })

    return { newPassword }
  }

  @trigger('create.before', {
    object: 'c_public_user',
    weight: 1,
    principal: 'c_system_user',
    if: {
      $eq: [{
        $pathTo: [{
          $dbNext: {
            maxTimeMS: 10000,
            object: 'c_studies',
            operation: 'cursor',
            paths: {
              $array: ['c_subject_invite_validation']
            }
          }
        }, 'c_subject_invite_validation']
      }, 'pin_only']
    }
  })
  setPinOnlyInvited({ new: newParticipant }) {

    const {
      c_last_invite_time = new Date()
        .toISOString(),
      c_access_code = generatePinCode(),
      c_locale = 'en_US'
    } = newParticipant

    const study = org.objects.c_studies.find()
      .limit(1)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('c_invite_code_ttl')
      .passive()
      .next()

    const inviteCodeTtl = study.c_invite_code_ttl || 0

    const update = { c_last_invite_time, c_invite: 'invited', c_access_code, c_locale }
    updatePinExpiry(update, inviteCodeTtl)

    script.arguments.new.update(update)
  }

}

function updatePinExpiry(pu, inviteCodeTtl) {
  if (inviteCodeTtl && inviteCodeTtl > 0) {
    const nowMillis = new Date()
      .getTime()
    const ttlMillis = inviteCodeTtl * 60 * 1000
    pu.c_pin_expiry_time = nowMillis + ttlMillis
  }
}

function generatePinCode(enableAltReg) {
  return axonLib.generateRandomDigitSequence(6)
}

function validateUserInvite(
  c_public_users,
  paramName,
  paramValue,
  c_access_code,
  donnotMatchErrorCode,
  requiredErrorCode,
  study
) {
  if (!c_access_code || !paramValue) {
    return faults.throw(requiredErrorCode)
  }
  const publicUserCursor = c_public_users.find({ c_access_code, [paramName]: paramValue })
    .expand('c_site')
    .skipAcl()
    .grant(consts.accessLevels.read)
    .transform({ script: 'c_invite_expiry_transform' })
  if (!publicUserCursor.hasNext()) {
    return faults.throw(donnotMatchErrorCode)
  }
  const publicUser = publicUserCursor.next()

  if (publicUser.c_invite === 'expired') {
    return faults.throw('axon.expired.invitationExpired')
  }

  // Check if pin code has expired.
  if (study.c_invite_code_ttl !== -1) {
    if (publicUser.c_pin_expiry_time) {
      if (new Date()
        .getTime() > new Date(publicUser.c_pin_expiry_time)
        .getTime()) {
        return faults.throw('axon.expired.pinCodeExpired')
      }
    }
  }

  c_public_users.updateOne({ _id: publicUser._id }, { $set: { c_invite_validated: true } })
    .skipAcl()
    .grant(consts.accessLevels.update)
    .execute()

  return publicUser
}

function validateRouteParams({ c_sites, c_site, c_public_users, publicUserId }) {
  // set query to check on the site
  if (!c_sites.find({ _id: c_site })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .hasNext()) {
    faults.throw('axon.invalidArgument.validSiteRequired')
  }

  const publicUserCursor = c_public_users.find({ _id: publicUserId })
    .limit(1)
    .skipAcl()
    .grant(consts.accessLevels.read)
  if (!publicUserCursor.hasNext()) {
    faults.throw('axon.invalidArgument.validAccountRequired')
  }
  const c_public_user = publicUserCursor.next()

  return { c_public_user }
}