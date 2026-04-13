import {
  route,
  log
} from 'decorators'

import logger from 'logger'
import faults from 'c_fault_lib'
import { isIdFormat } from 'util.id'
import { runnerIsAdmin } from 'c_nucleus_utils'
import { ValidatorsBase } from 'c_axon_alt_reg_methods_validators'
import axonScriptLib from 'c_axon_script_lib'
import notifications from 'notifications'
import { AltRegMethodsLibrary } from 'c_axon_alt_reg_methods'
const RegistrationValidator = require('c_axon_registration_validator')

const { accessLevels } = consts
const {
  c_public_users,
  c_caregiver_relationship,
  accounts,
  c_studies,
  c_sites
} = org.objects

function getPublicUser(publicUserId) {
  if (publicUserId && !isIdFormat(publicUserId)) {
    faults.throw('axon.invalidArgument.invalidObjectId')
  }
  const publicUserCursor = c_public_users.find({ _id: publicUserId })
    .grant(accessLevels.read)
    .expand('c_caregiver_relationship', 'c_study', 'c_site', 'c_group')
    .skipAcl()
  if (!publicUserCursor.hasNext()) {
    faults.throw('axon.invalidArgument.validSubjectRequired')
  }
  const publicUser = publicUserCursor.next()
  return publicUser
}

// Validation Methods
function validateInviteInputs(publicUserId, email, username) {
  // Validate public user
  if (!isIdFormat(publicUserId)) {
    faults.throw('axon.invalidArgument.validSubjectRequired')
  }

  const publicUser = getPublicUser(publicUserId)
  if (publicUser.c_type === 'caregiver') {
    faults.throw('axon.kValidationError.caregiverCannotBeClient')
  }

  // Validate study exists
  const userStudy = publicUser.c_study
  if (!userStudy) {
    faults.throw('axon.invalidArgument.subjectRequiresStudy')
  }

  // Get full study object if needed
  let study = userStudy
  if (!userStudy.c_pinned_version) {
    const studyCursor = c_studies.find({ _id: typeof userStudy === 'string' ? userStudy : userStudy._id })
      .limit(1)
      .skipAcl()
      .grant(consts.accessLevels.read)

    if (!studyCursor.hasNext()) {
      faults.throw('axon.invalidArgument.subjectRequiresStudy')
    }
    study = studyCursor.next()
  }

  // Validate email format if provided
  if (email) {
    ValidatorsBase.validateEmailRegex(email)
  }

  // Use universal validator for R5.2+ mixed-PII logic
  const validationResult = RegistrationValidator.validateInvite(
    study,
    publicUser.c_site,
    email,
    username
  )

  return {
    publicUser,
    isEmailBased: validationResult.isEmailBased
  }
}

// Relationship Methods
function getOrCreateCaregiverRelationship(publicUser) {
  // Try read first
  const existing = c_caregiver_relationship.find({ c_client: publicUser._id })
    .skipAcl()
    .grant(accessLevels.read)
  if (existing.hasNext()) return existing.next()

  // Create or fallback to existing on duplicate
  try {
    const caregiverRelationship = c_caregiver_relationship.insertOne({ c_client: publicUser._id })
      .lean(false)
      .skipAcl()
      .grant(accessLevels.update)
      .execute()

    c_public_users.updateOne(
      { _id: publicUser._id },
      { $set: { c_caregiver_relationship: caregiverRelationship._id } }
    )
      .skipAcl()
      .grant(accessLevels.update)
      .execute()

    return caregiverRelationship
  } catch (e) {
    // On any collision/race, return the already-created relationship
    const again = c_caregiver_relationship.find({ c_client: publicUser._id })
      .skipAcl()
      .grant(accessLevels.read)
    if (again.hasNext()) return again.next()
    throw e
  }
}

// Invite Methods
function findExistingInvite(caregiverRelationship, email, username, isEmailBased) {
  if (isEmailBased && email) {
    return caregiverRelationship.c_caregivers_info.find(v => v.c_email === email)
  }

  if (!isEmailBased && username) {
    return caregiverRelationship.c_caregivers_info.find(v => v.c_username === username)
  }

  return null
}

function updatePinExpiry(inviteCodeTtl) {
  if (inviteCodeTtl && inviteCodeTtl > 0) {
    const nowMillis = new Date()
      .getTime()
    const ttlMillis = inviteCodeTtl * 60 * 1000
    return nowMillis + ttlMillis
  }
}

function handleExistingInvite(invite, caregiverRelationship, enableInvite, isEmailBased, email, username) {
  // Check invite status
  logger.info(`care giver status for ${invite.c_invite_status}`)
  logger.info(`care giver enableInvite ${enableInvite}`)
  if (invite.c_invite_status === 'completed' && invite.c_caregiver_active === true) {
    faults.throw('axon.invalidArgument.invalidObjectId')
  }

  if (invite.c_invite_status === 'invited') {
    if ((isEmailBased && email) || (!isEmailBased && username)) {
      const query = isEmailBased ? { c_email: email } : { c_username: username }
      const caregiverCursor = c_public_users.find(query)
        .expand('c_study')

      if (caregiverCursor.hasNext()) {
        const publicUser = caregiverCursor.next()
        const inviteCodeTtl = publicUser.c_study.c_invite_code_ttl
        c_public_users.updateOne({ _id: publicUser._id }, {
          $set: {
            c_access_code: AltRegMethodsLibrary.generatePinCode(),
            c_pin_expiry_time: updatePinExpiry(inviteCodeTtl)
          }
        })
          .skipAcl()
          .grant(accessLevels.update)
          .execute()

        if (enableInvite && isEmailBased && email) {
          sendNotificationsInvite(c_public_users.find({ _id: publicUser._id })
            .next())
        }
        return getExpandedRelationship(caregiverRelationship._id)
      }
    }
  }

  // Handle reactivation
  if ((invite.c_invite_status === 'completed' || invite.c_invite_status === 'cancelled') &&
    invite.c_caregiver_active === false) {

    c_caregiver_relationship.updateOne(
      { _id: caregiverRelationship._id },
      {
        $push: {
          c_caregiver_assignments: invite.c_public_user._id
        },
        $set: {
          c_caregivers_info: [{
            _id: invite._id,
            c_caregiver_active: true
          }]
        }
      }
    )
      .skipAcl()
      .grant(accessLevels.update)
      .execute()

    return getExpandedRelationship(caregiverRelationship._id)
  }
}

const throwInvalidCaregiverInvite = () => faults.throw('axon.invalidArgument.invalidObjectId')

const normalizeInviteEmail = (value) => (value ? String(value).trim().toLowerCase() : null)
const normalizeInviteUsername = (value) => (value ? String(value).trim() : null)

function normalizeCaregiverIdentifiers({ email, username }) {
  return {
    normalizedEmail: normalizeInviteEmail(email),
    normalizedUsername: normalizeInviteUsername(username)
  }
}

function resolveStudyReference(studyRef) {
  if (!studyRef) {
    faults.throw('axon.invalidArgument.subjectRequiresStudy')
  }

  if (studyRef.c_pinned_version) {
    return studyRef
  }

  const cursor = c_studies.find({ _id: typeof studyRef === 'string' ? studyRef : studyRef._id })
    .limit(1)
    .skipAcl()
    .grant(consts.accessLevels.read)

  if (!cursor.hasNext()) {
    faults.throw('axon.invalidArgument.subjectRequiresStudy')
  }

  return cursor.next()
}

function resolveSiteReference(siteRef) {
  if (!siteRef) {
    return null
  }

  if (typeof siteRef !== 'string' && siteRef.c_no_pii !== undefined) {
    return siteRef
  }

  const cursor = c_sites.find({ _id: typeof siteRef === 'string' ? siteRef : siteRef._id })
    .limit(1)
    .skipAcl()
    .grant(consts.accessLevels.read)

  return cursor.hasNext() ? cursor.next() : null
}

function buildInvitePatch({ invite, normalizedEmail, normalizedUsername }) {
  const patch = {
    _id: invite._id,
    c_public_user: (invite.c_public_user && invite.c_public_user._id) ? invite.c_public_user._id : invite.c_public_user,
    c_invite_status: invite.c_invite_status,
    c_invited_date: invite.c_invited_date,
    c_caregiver_display_name: invite.c_caregiver_display_name,
    c_caregiver_active: invite.c_caregiver_active
  }

  if (normalizedUsername) {
    patch.c_username = normalizedUsername
    patch.c_email = null
  } else if (normalizedEmail) {
    patch.c_email = normalizedEmail
    patch.c_username = null
  } else {
    patch.c_email = null
    patch.c_username = null
  }

  return patch
}

function sanitizeCaregiverInviteEntry(invite) {
  if (!invite) return invite
  const sanitized = {}
  Object.keys(invite).forEach(key => {
    if (key === 'object') {
      return
    }
    const value = invite[key]
    if (key === 'c_public_user') {
      sanitized[key] = value && typeof value === 'object' ? (value._id || value) : value
      return
    }
    sanitized[key] = value
  })
  return sanitized
}

function updateInviteInRelationship({ caregiverRelationship, invite, normalizedEmail, normalizedUsername }) {
  const updatedInvites = (caregiverRelationship.c_caregivers_info || []).map(info => {
    const sanitizedInfo = sanitizeCaregiverInviteEntry(info)
    const isMatch = sanitizedInfo && sanitizedInfo._id && invite && invite._id && (
      (info._id.equals && typeof info._id.equals === 'function' && info._id.equals(invite._id)) ||
      (invite._id.equals && typeof invite._id.equals === 'function' && invite._id.equals(info._id)) ||
      String(info._id) === String(invite._id)
    )
    if (!isMatch) return sanitizedInfo
    return sanitizeCaregiverInviteEntry(buildInvitePatch({ invite, normalizedEmail, normalizedUsername }))
  })

  c_caregiver_relationship.updateOne(
    { _id: caregiverRelationship._id },
    { $set: { c_caregivers_info: updatedInvites.map(sanitizeCaregiverInviteEntry) } }
  )
    .skipAcl()
    .grant(accessLevels.update)
    .execute()
}

function updateCaregiverPublicUserIdentifiers({ caregiverUser, normalizedEmail, normalizedUsername }) {
  const $set = {}
  const $unset = {}

  if (normalizedEmail) {
    $set.c_email = normalizedEmail
    $set.c_participant_name_or_email = normalizedEmail
    $unset.c_username = 1
  }

  if (normalizedUsername) {
    $set.c_username = normalizedUsername
    $set.c_participant_name_or_email = normalizedUsername
    $unset.c_email = 1
  }

  const update = {}
  if (Object.keys($set).length) update.$set = $set
  if (Object.keys($unset).length) update.$unset = $unset
  if (!Object.keys(update).length) return

  c_public_users.updateOne({ _id: caregiverUser._id }, update)
    .skipAcl()
    .grant(accessLevels.update)
    .execute()
}

function buildCaregiverInviteContext({ publicUserId, caregiverUserId }) {
  if (!isIdFormat(caregiverUserId)) {
    throwInvalidCaregiverInvite()
  }

  const publicUser = getPublicUser(publicUserId)
  const study = resolveStudyReference(publicUser.c_study)
  const siteObj = resolveSiteReference(publicUser.c_site)

  const caregiverRelationshipCursor = c_caregiver_relationship.find({ c_client: publicUser._id })
    .skipAcl()
    .grant(accessLevels.read)

  if (!caregiverRelationshipCursor.hasNext()) {
    throwInvalidCaregiverInvite()
  }

  const caregiverRelationship = caregiverRelationshipCursor.next()
  const invite = (caregiverRelationship.c_caregivers_info || []).find(info => {
    if (!info || !info.c_public_user) return false
    const inviteUserId = info.c_public_user._id ? info.c_public_user._id : info.c_public_user
    return String(inviteUserId) === String(caregiverUserId)
  })

  if (!invite || invite.c_invite_status !== 'invited') {
    throwInvalidCaregiverInvite()
  }

  const caregiverUser = getPublicUser(caregiverUserId)
  if (caregiverUser.c_account) {
    throwInvalidCaregiverInvite()
  }

  const inviteHasEmail = Boolean(invite.c_email && invite.c_email.trim())
  const inviteHasUsername = Boolean(invite.c_username && invite.c_username.trim())
  const isR52Plus = study.c_pinned_version >= 50200
  const isStrictNoPii = Boolean(siteObj && siteObj.c_no_pii === true)

  return {
    publicUser,
    caregiverRelationship,
    invite,
    caregiverUser,
    study,
    siteObj,
    inviteHasEmail,
    inviteHasUsername,
    isR52Plus,
    isStrictNoPii
  }
}

function validateRemoveEmailRequest({ isR52Plus, isStrictNoPii, inviteHasEmail }) {
  if (!isR52Plus || isStrictNoPii || !inviteHasEmail) {
    throwInvalidCaregiverInvite()
  }
}

function handleRemoveEmail({ caregiverRelationship, caregiverUser, invite }) {
  c_public_users.updateOne(
    { _id: caregiverUser._id },
    {
      $unset: { c_email: 1, c_username: 1 },
      $set: { c_participant_name_or_email: '' }
    }
  )
    .skipAcl()
    .grant(accessLevels.update)
    .execute()

  updateInviteInRelationship({
    caregiverRelationship,
    invite,
    normalizedEmail: null,
    normalizedUsername: null
  })

  return getExpandedRelationship(caregiverRelationship._id)
}

function validateIdentifierInputsForInvite({ email, username, study, site, publicUser }) {
  if (email) {
    ValidatorsBase.validateEmailRegex(email)
  }

  const validationResult = RegistrationValidator.validateInvite(
    study,
    site || publicUser.c_site,
    email,
    username
  )

  if (validationResult.isEmailBased && !email) {
    faults.throw('axon.invalidArgument.validEmailRequired')
  }

  if (!validationResult.isEmailBased && !username) {
    faults.throw('axon.invalidArgument.usernameRequired')
  }

  return validationResult
}

function ensureIdentifierTypeChangeAllowed({ isR52Plus, inviteHasEmail, inviteHasUsername, email, username }) {
  if (isR52Plus) {
    return
  }

  if (inviteHasEmail && username) {
    faults.throw('axon.invalidArgument.noInviteForEmail')
  }

  if (inviteHasUsername && email) {
    faults.throw('axon.invalidArgument.noInviteForUsername')
  }
}

function ensureIdentifiersAvailable({ normalizedEmail, normalizedUsername, caregiverUser }) {
  if (normalizedEmail) {
    const existingEmailUser = c_public_users.find({ c_email: normalizedEmail })
      .limit(1)
      .skipAcl()
      .grant(accessLevels.read)
    if (existingEmailUser.hasNext()) {
      const existing = existingEmailUser.next()
      if (!existing._id.equals(caregiverUser._id)) {
        faults.throw('axon.exists.identifierAlreadyInUse')
      }
    }
  }

  if (normalizedUsername) {
    const existingUsernameUser = c_public_users.find({ c_username: normalizedUsername })
      .limit(1)
      .skipAcl()
      .grant(accessLevels.read)
    if (existingUsernameUser.hasNext()) {
      const existing = existingUsernameUser.next()
      if (!existing._id.equals(caregiverUser._id)) {
        faults.throw('axon.exists.identifierAlreadyInUse')
      }
    }
  }
}

function persistCaregiverIdentifierUpdates({
  caregiverRelationship,
  invite,
  caregiverUser,
  normalizedEmail,
  normalizedUsername
}) {
  updateCaregiverPublicUserIdentifiers({
    caregiverUser,
    normalizedEmail,
    normalizedUsername
  })

  updateInviteInRelationship({
    caregiverRelationship,
    invite,
    normalizedEmail,
    normalizedUsername
  })
}

function findOrCreateCaregiverUser(publicUser, email, username, isEmailBased) {
  // If identifier provided, try to find existing user
  if ((isEmailBased && email) || (!isEmailBased && username)) {
    const normalizedEmail = isEmailBased && email ? email.toLowerCase().trim() : null
    const normalizedUsername = !isEmailBased && username ? username.trim() : null
    const query = isEmailBased ? { c_email: normalizedEmail } : { c_username: normalizedUsername }
    const caregiverCursor = c_public_users.find(query)
      .skipAcl()
      .grant(accessLevels.read)

    if (caregiverCursor.hasNext()) {
      return faults.throw('axon.exists.caregiverAlreadyInUse')
    }
  }

  const allGroup = axonScriptLib.findAllGroup(publicUser.c_study._id)
  const group = (publicUser.c_group && publicUser.c_group._id) || (allGroup && allGroup._id)

  // Handle c_site - can be undefined, string ID, or object
  const siteId = publicUser.c_site ? (typeof publicUser.c_site === 'string' ? publicUser.c_site : publicUser.c_site._id) : null

  return c_public_users.insertOne({
    c_study: publicUser.c_study._id,
    ...(siteId ? { c_site: siteId } : {}),
    c_tz: publicUser.c_tz,
    c_locale: publicUser.c_locale,
    c_group: group,
    c_type: 'caregiver',
    ...(isEmailBased && email ? { c_email: email.toLowerCase().trim() } : {}),
    ...(!isEmailBased && username ? { c_username: username.trim() } : {})
  })
    .skipAcl()
    .grant(consts.accessLevels.script)
    .lean(false)
    .execute()
}

function createNewInvite(caregiverRelationship, caregiverUser, email, username, displayName, isEmailBased, enableInvite) {

  if (caregiverUser.c_account) {
    return faults.throw('axon.exists.caregiverAlreadyInUse')
  } else {
    const caregiverInvite = {
      c_public_user: caregiverUser._id,
      c_invite_status: 'invited',
      c_invited_date: new Date(),
      c_caregiver_display_name: displayName,
      c_caregiver_active: false,
      ...(isEmailBased && email ? { c_email: email.toLowerCase().trim() } : {}),
      ...(!isEmailBased && username ? { c_username: username.trim() } : {})
    }

    c_caregiver_relationship.updateOne(
      { _id: caregiverRelationship._id },
      { $push: { c_caregivers_info: caregiverInvite } }
    )
      .lean(false)
      .skipAcl()
      .grant(accessLevels.update)
      .execute()

    if (enableInvite && isEmailBased && email) {
      sendNotificationsInvite(caregiverUser)
    }
  }
  return {
    caregiverRelationship: getExpandedRelationship(caregiverRelationship._id),
    caregiverUser
  }
}

// Utility Methods
function getExpandedRelationship(relationshipId) {
  return c_caregiver_relationship.find()
    .where({ _id: relationshipId })
    .expand(['c_client', 'c_caregivers', 'c_caregivers_info.c_public_user'])
    .skipAcl()
    .grant(consts.accessLevels.read)
    .next()
}

function sendNotificationsInvite(caregiverUser) {
  const study = c_studies.find({ _id: caregiverUser.c_study._id })
    .limit(1)
    .skipAcl()
    .grant(consts.accessLevels.read)
    .next()
  const paweb_url = axonScriptLib.getPatientAppWebURL()
  const {
    downloadText,
    appleStore,
    googleStore
  } = axonScriptLib.findMobileAppVersion()
  const {
    appleStore_url,
    googleStore_url,
    isChina
  } = axonScriptLib.findMobileAppLinks()

  const isPAWEnabled = axonScriptLib.isPAWEnabled()
  const inviteNotifPayload = {
    email: study.c_subject_invite_validation === 'email_pin' && caregiverUser.c_email,
    study_name: study.c_name,
    access_code: caregiverUser.c_access_code,
    paweb_url,
    downloadText,
    appleStore,
    googleStore: googleStore && !isChina,
    isMobileOnlyStudy: (googleStore || appleStore) && !isPAWEnabled,
    isWebOnlyStudy: !googleStore && !appleStore && isPAWEnabled,
    isMobileAndWebStudy: (googleStore || appleStore) && isPAWEnabled,
    appleStore_url,
    googleStore_url
  }
  notifications.send('c_axon_new_caregiver_invite', inviteNotifPayload, {
    recipient: caregiverUser.c_email,
    locale: 'en_US'
  })
}

export class CaregiverManager {

  /**
   * @openapi
   * /c_public_users/{publicUserId}/caregiver/invite:
   *  post:
   *    description: 'c_participant_events'
   *    parameters:
   *      - name: publicUserId
   *        in: path
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *
   *    responses:
   *      '200':
   *        description: c_event object
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/components/schemas/c_event'
   *      '400':
   *        description: axon.invalidArgument.invalidObjectId or cortex.accessDenied.sessionExpired or cortex.accessDenied.instanceRead
   */
  /**
   * Caregiver Invite Process:
   *
   * 1. Validate inputs and study settings
   * 2. Get or create caregiver relationship
   * 3. Handle existing invites (if any)
   * 4. Create new caregiver user if needed
   * 5. Create invite with 'invited' status
   */

  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_caregiver_invite',
    path: 'c_public_users/:publicUserId/caregiver/invite',
    acl: ['account.anonymous']
  })
  static inviteCaregiver({
    req,
    body
  }) {
    const { publicUserId } = req.params
    const {
      email,
      username,
      displayName,
      enableInvite
    } = body()

    // 1. Validate inputs and get study settings
    const {
      publicUser,
      isEmailBased
    } = validateInviteInputs(publicUserId, email, username)

    // 2. Get or create caregiver relationship
    const caregiverRelationship = getOrCreateCaregiverRelationship(publicUser)
    logger.info('getOrCreateCaregiverRelationship(publicUser)')

    // 3. Handle existing invite if any
    const existingInvite = findExistingInvite(caregiverRelationship, email, username, isEmailBased)
    logger.info('existingInvite')

    if (existingInvite) {
      return handleExistingInvite(existingInvite, caregiverRelationship, enableInvite, isEmailBased, email, username)
    }

    logger.info(`No existing invite found for ${publicUserId}`)
    // 4. Find or create caregiver user
    const caregiverUser = findOrCreateCaregiverUser(publicUser, email, username, isEmailBased)
    logger.info('findOrCreateCaregiverUser')

    // 5. Create new invite
    return createNewInvite(caregiverRelationship, caregiverUser, email, username, displayName, isEmailBased, enableInvite)
  }

  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_caregiver_register',
    path: 'caregiver/register',
    acl: ['account.anonymous']
  })
  static registerCaregiver({
    req,
    body
  }) {
    const {
      email,
      password,
      name,
      caregiverUserId,
      username,
      mobile
    } = body()
    let newAccount
    const caregiverUser = getPublicUser(caregiverUserId)
    if (caregiverUser.c_account) {
      faults.throw('axon.invalidArgument.subjectRequiresStudy')
    }
    if (caregiverUser.c_type !== 'caregiver') {
      faults.throw('axon.invalidArgument.subjectRequiresStudy')
    }
    const relationships = c_caregiver_relationship
      .find({
        c_caregivers_info: {
          $elemMatch: {
            c_public_user: caregiverUser._id,
            c_invite_status: 'invited'
          }
        }
      })
      .skipAcl()
      .grant(accessLevels.read)
      .toArray()

    if (!relationships || relationships.length === 0) {
      // No relationships found
      faults.throw('axon.invalidArgument.subjectRequiresStudy')
    }

    const userStudy = caregiverUser.c_study
    if (!userStudy) {
      faults.throw('axon.invalidArgument.subjectRequiresStudy')
    }
    const studyCursor = c_studies.find({ _id: userStudy._id })
      .limit(1)
      .skipAcl()
      .grant(consts.accessLevels.read)

    if (!studyCursor.hasNext()) {
      faults.throw('axon.invalidArgument.subjectRequiresStudy')
    }

    const study = studyCursor.next()

    // Use universal validator for R5.2+ mixed-PII logic
    const validationResult = RegistrationValidator.validateRegistration(
      study,
      caregiverUser.c_site,
      caregiverUser,
      email,
      username
    )

    if (!password) {
      faults.throw('axon.invalidArgument.passwordRequired')
    }

    const {
      c_locale: locale,
      c_tz: tz
    } = caregiverUser
    const accountCreationData = {
      password,
      locale,
      tz,
      roles: [consts.roles.c_study_participant]
    }

    // Use validation result to determine identifier type FIRST
    if (validationResult.shouldUseEmail) {
      accountCreationData.email = email
    } else if (validationResult.shouldUseUsername) {
      accountCreationData.username = username
    }

    // Check c_auth_task_fields based on what identifier we're actually using
    // Use validator to determine if PII fields should be bypassed
    const shouldBypassPiiFields = RegistrationValidator.shouldBypassPiiFields(study, caregiverUser.c_site, caregiverUser)
    const authTaskFields = study.c_auth_task_fields || []

    authTaskFields.forEach(field => {
      // Skip PII fields when bypass is enabled
      if (shouldBypassPiiFields && ['email', 'name', 'mobile'].includes(field)) {
        return
      }

      switch (field) {
        case 'name':
          if (!(
            typeof name === 'object' &&
            name.first &&
            name.last)) {
            faults.throw('axon.invalidArgument.nameRequired')
          }
          break
        case 'username':
          // Only require username if we're actually using username (not email)
          if (validationResult.shouldUseUsername && !username) {
            faults.throw('axon.invalidArgument.usernameRequired')
          }
          break
        case 'email':
          // Only require email if we're actually using email (not username)
          if (validationResult.shouldUseEmail && !email) {
            faults.throw('axon.invalidArgument.emailRequired')
          }
          break
        case 'mobile':
          if (!mobile) {
            faults.throw('axon.invalidArgument.mobileRequired')
          }
          break
      }
    })

    if (name) {
      accountCreationData.name = name
    }
    if (mobile) {
      accountCreationData.mobile = mobile
    }

    const allGroup = axonScriptLib.findAllGroup(study._id)
    const publicUserCursor = c_public_users.find({ _id: caregiverUser._id })
      .grant(accessLevels.read)
      .expand('c_caregiver_relationship')
      .skipAcl()
      .grant(accessLevels.read)
    if (!publicUserCursor.hasNext()) {
      faults.throw('axon.invalidArgument.validSubjectRequired')
    }
    const publicUser = publicUserCursor.next()
    const group = (publicUser.c_group && publicUser.c_group._id) || (allGroup && allGroup._id)
    accountCreationData.c_study_groups = [group]

    newAccount = accounts.register(accountCreationData, {
      skipNotification: true,
      skipVerification: true,
      verifyLocation: true
    })

    // Update public user with account and identifier (normalized to lowercase)
    const updateData = {
      c_account: newAccount._id,
      c_invite: 'accepted',
      c_invite_validated: true
    }
    if (validationResult.shouldUseEmail && email) {
      updateData.c_email = email.toLowerCase().trim()
    } else if (validationResult.shouldUseUsername && username) {
      updateData.c_username = username.trim()
    }

    c_public_users.updateOne({ _id: caregiverUser._id }, {
      $set: updateData
    })
      .skipAcl()
      .grant(accessLevels.update)
      .execute()

    relationships.forEach(relationship => {
      const invite = relationship.c_caregivers_info.find(info =>
        info.c_public_user._id.equals(caregiverUser._id)
      )
      if (invite) {
        c_caregiver_relationship.updateOne(
          { _id: relationship._id },
          {
            $set: {
              c_caregivers_info: [{
                _id: invite._id,
                c_register_date: new Date(),
                c_caregiver_active: true,
                c_invite_status: 'completed',
                ...(validationResult.shouldUseEmail && email ? { c_email: email.toLowerCase().trim() } : {}),
                ...(validationResult.shouldUseUsername && username ? { c_username: username.trim() } : {})
              }]
            },
            $push: {
              c_caregiver_assignments: caregiverUser._id
            }
          }
        )
          .skipAcl()
          .grant(accessLevels.update)
          .execute()
      }
    }
    )

    return {
      newAccount,
      caregiverRelationship: c_caregiver_relationship
        .find({
          c_caregivers_info: {
            $elemMatch: {
              c_public_user: caregiverUser._id
            }
          }
        })
        .expand(['c_client', 'c_caregivers', 'c_caregivers_info.c_public_user'])
        .skipAcl()
        .grant(accessLevels.read)
        .toArray()

    }
  }

  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'c_caregiver_relationships',
    path: 'c_public_users/:publicUserId/c_caregiver_relationships',
    acl: ['account.anonymous']
  })
  static caregiverRelationships({ req }) {
    const { publicUserId } = req.params
    if (!isIdFormat(publicUserId)) {
      faults.throw('axon.invalidArgument.validSubjectRequired')
    }
    const publicUser = getPublicUser(publicUserId)
    let {
      where,
      sort
    } = req.query

    if (where) {
      where = JSON.parse(where)
    }
    if (!runnerIsAdmin() && !publicUser.c_account._id.equals(script.principal._id)) {
      // Logged in as incorrect user.
      return faults.throw('axon.accessDenied.routeAccessDenied')
    }

    const criteria = {
      $or: [
        { c_client: publicUserId },
        { 'c_caregivers_info.c_public_user': publicUserId }
      ],
      ...(where ? { ...where } : {})
    }

    const doc = org.objects.c_caregiver_relationships
      .find(criteria)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .limit(1) // optional with findOne; keeps it lean if findOne isn't available
      .expand(['c_client', 'c_caregivers_info.c_public_user'])
      .toArray() || []

    return doc
  }

  @log({ traceError: true })
  @route({
    method: 'PUT',
    name: 'c_caregivers_info_update',
    path: 'c_public_users/:publicUserId/caregiver/:cgPuId',
    acl: ['account.anonymous']
  })
  static updateCaregiver({
    req,
    body
  }) {
    const { publicUserId } = req.params
    const { cgPuId } = req.params
    const {
      disableCaregiver,
      displayName
    } = body()
    // Find the relationship for this client
    const caregiverRelationshipCursor = c_caregiver_relationship.find({ c_client: publicUserId })
      .skipAcl()
      .grant(accessLevels.read)

    if (!caregiverRelationshipCursor.hasNext()) {
      faults.throw('axon.invalidArgument.validSubjectRequired')
    }

    // Remove the caregiver directly from c_caregivers list
    const caregiverRelationship = caregiverRelationshipCursor.next()

    const invite = caregiverRelationship.c_caregivers_info.find(v => v.c_public_user._id.equals(cgPuId))
    if (!invite) {
      // no invite means no invite
      // TODO: Fix fault codes
      faults.throw('axon.invalidArgument.invalidObjectId')
    }

    if (invite.c_invite_status !== 'completed') {
      faults.throw('axon.invalidArgument.unregisteredCaregiverUpdate')
    }

    const isCurrentlyAssigned = Array.isArray(caregiverRelationship.c_caregiver_assignments) &&
      caregiverRelationship.c_caregiver_assignments.some(id => id.equals(cgPuId))

    const updateQuery = {
      $set: {
        c_caregivers_info: [{
          _id: invite._id,
          c_caregiver_active: !disableCaregiver,
          c_caregiver_display_name: displayName || invite.c_caregiver_display_name,
          ...(disableCaregiver && { c_removal_date: new Date() })
        }]
      }
    }

    if (disableCaregiver && isCurrentlyAssigned) {
      updateQuery.$pull = { c_caregiver_assignments: cgPuId }
    }

    if (!disableCaregiver && !isCurrentlyAssigned) {
      updateQuery.$push = { c_caregiver_assignments: cgPuId }
    }

    c_caregiver_relationship.updateOne(
      { _id: caregiverRelationship._id },
      updateQuery
    )
      .skipAcl()
      .grant(accessLevels.update)
      .execute()

    return {
      success: true,
      message: 'Caregiver updated successfully',
      data: {
        relationship: getExpandedRelationship(caregiverRelationship._id)
      }
    }
  }

  @log({ traceError: true })
  @route({
    method: 'PUT',
    name: 'c_caregiver_identifier_edit',
    path: 'c_public_users/:publicUserId/caregiver/invite/:caregiverUserId',
    acl: ['account.anonymous']
  })
  static editCaregiverInvite({
    req,
    body
  }) {
    const { publicUserId } = req.params
    const { caregiverUserId } = req.params
    const {
      email,
      username,
      removeEmail
    } = body()

    const { normalizedEmail, normalizedUsername } = normalizeCaregiverIdentifiers({ email, username })
    const context = buildCaregiverInviteContext({ publicUserId, caregiverUserId })

    if (removeEmail) {
      validateRemoveEmailRequest(context)
      return handleRemoveEmail(context)
    }

    validateIdentifierInputsForInvite({
      email,
      username,
      study: context.study,
      site: context.siteObj,
      publicUser: context.publicUser
    })

    ensureIdentifierTypeChangeAllowed({
      isR52Plus: context.isR52Plus,
      inviteHasEmail: context.inviteHasEmail,
      inviteHasUsername: context.inviteHasUsername,
      email,
      username
    })

    ensureIdentifiersAvailable({
      normalizedEmail,
      normalizedUsername,
      caregiverUser: context.caregiverUser
    })

    persistCaregiverIdentifierUpdates({
      caregiverRelationship: context.caregiverRelationship,
      invite: context.invite,
      caregiverUser: context.caregiverUser,
      normalizedEmail,
      normalizedUsername
    })

    return getExpandedRelationship(context.caregiverRelationship._id)
  }

}