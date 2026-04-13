/* eslint-disable no-prototype-builtins */
import moment from 'moment'
import validator from 'c_axon_assets_validation_library'
import faults from 'c_fault_lib'
import _ from 'underscore'
import { id } from 'util'
import { object, trigger, log } from 'decorators'
import PreventOrphanRecordsLibrary from 'c_prevent_orphan_records'
const { AnchorDate: { TEMPLATE_TYPES: { STATIC } } } = require('c_anchor_dates')
const { c_participant_schedule: ParticipantSchedule, c_anchor_date_templates: AnchorDateTemplates } = org.objects

@object('c_study')
// eslint-disable-next-line no-undef
class StudyLibrary extends CortexObject {

  static AUTH_FIELDS = Object.freeze({
    name: 'name',
    username: 'username',
    email: 'email',
    password: 'password',
    mobile: 'mobile',
    dob: 'dob'
  })

  @log({ traceError: true })
  @trigger('create.before', 'update.before', { weight: 1 })
  static beforeCreateUpdateStudy({ new: newStudy, old: oldStudy, modified, context, event }) {
    StudyLibrary.validateFilename(newStudy)
    StudyLibrary.validatePrivacyItems(modified, newStudy)
    StudyLibrary.updateAccountsSettings()
    StudyLibrary.handleAuthTaskFields(newStudy, context, event, modified)
    StudyLibrary.validateStoreInviteData({ ...oldStudy, ...newStudy })

    const study = { ...oldStudy, ...newStudy }
    const { c_use_advanced_task_scheduler, c_default_participant_schedule, c_no_pii, c_format_spec_subject_id } = study

    let new_format_spec_subject_id = c_format_spec_subject_id && c_format_spec_subject_id.replace(/\+/g, '\\+')
      .replace(/\./g, '\\.')
      .replace(/\?/g, '\\?')
      .replace(/\^/g, '\\^')
      .replace(/\$/g, '\\$')
      .replace(/\*/g, '\\*')
      .replace(/\(/g, '\\(')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\\{SITE\\}/g, '{SITE}')
      .replace(/\\{COUNTRY\\}/g, '{COUNTRY}')
      .replace(/\\{PROTOCOL\\}/g, '{PROTOCOL}')

    if (!new_format_spec_subject_id) {
      new_format_spec_subject_id = 'P#####'
    }

    if (Array.isArray(newStudy.c_site_supported_locales) && newStudy.c_site_supported_locales.length) {
      const studySiteLocales = newStudy.c_site_supported_locales
      const studyLocales = study.c_supported_locales || []
      if (!studySiteLocales.every(locale => studyLocales.includes(locale))) {
        return faults.throw('axon.invalidArgument.invalidSiteLocale')
      }
    }

    if (event === 'update.before') {

      if (modified.includes('c_subject_status_list')) {
        PreventOrphanRecordsLibrary.isStatusAssociated(newStudy, oldStudy)
      }
      if (c_use_advanced_task_scheduler) {
        StudyLibrary.setDefaultStaticAnchorDate(study)
        if (!c_default_participant_schedule) {
          StudyLibrary.setDefaultParticipantSchedule(study)
        }
      }
    }
    if (event === 'create.before') {
      if (c_no_pii) {
        script.arguments.new.update({
          c_login_identifier: 'username',
          c_subject_invite_validation: 'pin_only',
          c_store_invite_data: false,
          c_auth_task_fields: ['username', 'password'],
          c_forgot_username_options: [],
          c_format_spec_subject_id: new_format_spec_subject_id
        })
      } else {
        script.arguments.new.update({
          c_login_identifier: 'email',
          c_auth_task_fields: ['email', 'password'],
          c_format_spec_subject_id: new_format_spec_subject_id
        })
      }
    } else {
      script.arguments.new.update({
        c_format_spec_subject_id: new_format_spec_subject_id
      })
    }
  }

  @log({ traceError: true })
  @trigger('create.after', { weight: 1 })
  static afterCreateStudy({ new: newStudy, context }) {
    const { _id: studyId } = newStudy
    const { c_default_participant_schedule, c_use_advanced_task_scheduler } = newStudy

    if (c_use_advanced_task_scheduler && !c_default_participant_schedule) {
      StudyLibrary.setDefaultParticipantSchedule(newStudy)
    }

    StudyLibrary.createDefaultParticipantGroups(studyId, context)
    if (c_use_advanced_task_scheduler) StudyLibrary.setDefaultStaticAnchorDate(context)

    StudyLibrary.createDeactivationPatientFlag(studyId)

  }

  @log({ traceError: true })
  @trigger('update.after', { weight: 1 })
  static afterUpdateStudy({ modified, new: newStudy, old: oldStudy }) {
    StudyLibrary.removeRequiredReviews(modified, newStudy, oldStudy)
    StudyLibrary.disableTelevisit(modified, newStudy)
  }

  @log({ traceError: true })
  @trigger('create.before', 'update.before', { object: 'c_study', weight: 1 })
  static beforeCreateUpdatePublicUser({ new: newStudy, old: oldStudy }) {

    const { c_enable_alt_reg } = { ...oldStudy, ...newStudy }

    if (!c_enable_alt_reg) return

    StudyLibrary.validateStoreInviteData(
      StudyLibrary.find({ _id: newStudy._id })
        .paths('c_subject_invite_validation', 'c_store_invite_data')
        .skipAcl()
        .grant(consts.accessLevels.read)
        .next()
    )
  }

  /**
   * @script Axon - After Study Trigger
   *
   * @brief Create default participant groups and generate
   * pin after creating a study
   *
   * @object     c_study
   *
   * @on         After Create
   *
   * @author     Matt Lean     (Medable.MIL)
   *
   * @version    4.2.0         (Medable.MIL)
   *
   * (c)2016-2017 Medable, Inc.  All Rights Reserved.
   * Unauthorized use, modification, or reproduction is prohibited.
   * This is a component of Axon, Medable's SmartStudy(TM) system.
   */
  static createDefaultParticipantGroups(studyId, context) {
    const { orgs, c_groups: groups } = org.objects,
          pin = orgs.find({ _id: org._id })
            .paths('c_pin')
            .skipAcl()
            .grant(consts.accessLevels.read)
            .next().c_pin,
          seed = moment()
            .valueOf()

    function random() {
      const x = Math.sin(seed + 1) * 10000
      return x - Math.floor(x)
    }

    function generateAccessCode() {
      let accessCode = ''
      const possibleChars = '0123456789'

      for (let i = 0; i < 4; ++i) {
        accessCode += possibleChars.charAt(Math.floor(random() * possibleChars.length))
      }

      return accessCode
    }

    // Create org exclusive pin if it doesn't exist
    if (!pin) {
      orgs
        .updateOne({ _id: org._id }, {
          $set: { c_pin: generateAccessCode() }
        })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }

    const allG = groups
      .insertOne({
        c_name: 'All', c_study: studyId, c_display_in_invite_list: true
      })
      .bypassCreateAcl()
      .execute()

    const publicG = groups
      .insertOne({
        c_name: 'Public', c_study: studyId
      })
      .bypassCreateAcl()
      .execute()

    org.objects[context.object]
      .updateOne({ _id: context._id }, {
        $set: {
          c_public_group: publicG,
          c_default_subject_group: allG
        }
      })
      .skipAcl()
      .grant(consts.accessLevels.delete)
      .execute()
  }

  /**
   * @script Axon - Hybrid - Remove required reviews
   *
   * @brief Remove required reviews when deleted
   *
   * @author Nahuel Dealbera     (Medable.MIL)
   *
   * (c)2016-2017 Medable, Inc.  All Rights Reserved.
   * Unauthorized use, modification, or reproduction is prohibited.
   * This is a component of Axon, Medable's SmartStudy(TM) system.
   */
  static removeRequiredReviews(modified, newStudy, oldStudy) {
    // detects if a review type went from active to inactive
    const getNewInactiveReviewType = (newReviewTypes, oldReviewTypes) => _.chain(newReviewTypes)
      .filter((newReviewType, idx) => {
        return newReviewType.hasOwnProperty('c_active') &&
          !newReviewType.c_active &&
          oldReviewTypes[idx].hasOwnProperty('c_active') &&
          oldReviewTypes[idx].c_active
      })
      .first()
      .value()

    // update group task c_required_reviews
    const updateGroupTaskWith = (id, requiredReviews) => org.objects
      .c_group_tasks
      .updateOne({ _id: id }, {
        $set: { c_required_reviews: requiredReviews }
      })
      .execute()

    // main method
    const removeInactiveReviewTypes = inactiveReviewTypeId => org.objects
      .c_group_tasks
      .find()
      .skipAcl()
      .grant(consts.accessLevels.delete)
      .limit(1000)
      .toArray()
      .filter(groupTask => groupTask.c_required_reviews.length > 0)
      .forEach(groupTask => {
        const requiredReviews = groupTask.c_required_reviews
        if (id.inIdArray(requiredReviews, inactiveReviewTypeId)) {
          const modifiedRequiredReviews = requiredReviews
            .filter(r => !id.equalIds(r, inactiveReviewTypeId))

          updateGroupTaskWith(groupTask._id, modifiedRequiredReviews)
        }
      })

    const didReviewTypesChange = modified => _(modified)
      .contains('c_review_types')

    if (didReviewTypesChange(modified)) {
      const newReviewTypes = newStudy.c_review_types
      const oldReviewTypes = oldStudy.c_review_types

      const newInactiveReviewType = getNewInactiveReviewType(newReviewTypes, oldReviewTypes)

      newInactiveReviewType &&
        removeInactiveReviewTypes(newInactiveReviewType._id)
    }
  }

  /**
   * @script Axon - Study trigger to manage Public user status
   * updates
   *
   * @brief We need to see if a status was removed from the
   * c_study.c_subject_status_list and if so we need
   * to remove it from any tasks that set it. It also
   * needs to be removed as the enrollment status if set
   *
   * (c)2016-2017 Medable, Inc.  All Rights Reserved.
   * Unauthorized use, modification, or reproduction is prohibited.
   * This is a component of Axon, Medable's SmartStudy(TM) system.
   */
  static disableTelevisit(modified, newStudy) {

    if (_.contains(modified, 'c_televisit_enabled')) {
      if (!newStudy.c_televisit_enabled) {
        org.objects.c_groups.updateMany({ c_study: script.context._id }, { $set: { c_televisit_enabled: false } })
          .limit(1000)
          .skipAcl()
          .grant(consts.accessLevels.update)
          .execute()
      }
    }
  }

  static validatePrivacyItems(modified, newStudy) {
    if (_.contains(modified, 'c_privacy_items')) {
      const privacyItems = newStudy.c_privacy_items
      privacyItems.forEach((privacyItem) => {
        if (!privacyItem.c_apps || privacyItem.c_apps.length === 0) {
          faults.throw('axon.invalidArgument.privacyItemsApps')
        }
      })
      if (privacyItems.some(
        item => !_.isEmpty(item.c_html_content) && !_.isEmpty(item.c_url)
      )) {
        faults.throw('axon.invalidArgument.privacyItemsContent')
      }
      // validate selected apps.
      const apps = org.objects.org.find()
        .paths('apps')
        .skipAcl()
        .grant(consts.accessLevels.read)
        .next()
        .apps
      if (!privacyItems.every(
        item => item.c_apps.every(appName => apps.some(app => app.name === appName))
      )) {
        faults.throw('axon.invalidArgument.privacyItemSelectedApp')
      }
    }
  }

  static validateFilename(newStudy) {
    if (validator.checkIfFileNamesAreDup(newStudy)) {
      faults.throw('axon.invalidArgument.duplicateFilenames')
    }
  }

  static updateAccountsSettings() {
    const { orgs } = org.objects
    const currentOrg = orgs.find()
      .skipAcl()
      .grant('read')
      .next()

    const accounts = currentOrg.configuration.accounts

    accounts.requireMobile = false
    accounts.enableEmail = true
    accounts.requireEmail = false
    accounts.enableUsername = true
    accounts.requireUsername = false

    return orgs.updateOne({ _id: currentOrg._id },
      {
        $set: {
          configuration: {
            accounts
          }
        }
      })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .lean(true)
      .execute()
  }

  static handleAuthTaskFields(newStudy, context, event, modified) {
    if (event === 'create.before') {
      context.update('c_auth_task_fields', [
        StudyLibrary.AUTH_FIELDS.name,
        StudyLibrary.AUTH_FIELDS.username,
        StudyLibrary.AUTH_FIELDS.email,
        StudyLibrary.AUTH_FIELDS.password,
        StudyLibrary.AUTH_FIELDS.mobile,
        StudyLibrary.AUTH_FIELDS.dob
      ])
    } else if (event === 'update.before') {
      StudyLibrary.validateAuthTaskFields(newStudy, modified)
    }
  }

  static validateAuthTaskFields(newStudy, modified) {
    if (modified.some(prop => prop.includes('c_auth_task_fields'))) {
      const authTaskFields = newStudy.c_auth_task_fields
      if (Array.isArray(authTaskFields) && authTaskFields.length) {
        // We will add to the the study before-update trigger to ensure the minimum set:  (username|email) and password
        const usernameOrEmailField = authTaskFields
          .some(
            field => [StudyLibrary.AUTH_FIELDS.username, StudyLibrary.AUTH_FIELDS.email].includes(field)
          )
        const passwordField = authTaskFields
          .some(field => field === StudyLibrary.AUTH_FIELDS.password)
        if (usernameOrEmailField && passwordField) {
          return
        }
      }
      faults.throw('axon.validationError.authTaskFieldsMinimumSet')
    }
  }

  static validateStoreInviteData(study) {
    switch (study.c_subject_invite_validation) {
      case 'email_pin':
      case 'mobile_pin':
      case 'username_pin': {
        if (!study.c_store_invite_data) {
          faults.throw('axon.invalidArgument.storeInviteData')
        }
      }
    }
  }

  static setDefaultParticipantSchedule(study) {

    let participantSchedule = null
    const participantScheduleCursor = ParticipantSchedule.find({
      c_name: 'Default Participant Schedule'
    })
    if (participantScheduleCursor.hasNext()) {
      participantSchedule = participantScheduleCursor.next()
      // if not already done: set the study id on the default praticipant schedule
      if (!participantSchedule.c_study) {
        ParticipantSchedule.updateOne({ _id: participantSchedule._id }, {
          $set: {
            c_study: study._id
          }
        })
          .execute()
      }
    } else {
      participantSchedule = ParticipantSchedule
        .insertOne({
          c_name: 'Default Participant Schedule',
          c_study: study._id
        })
        .execute()
    }
    StudyLibrary.updateOne(
      { _id: study._id },
      { $set: { c_default_participant_schedule: participantSchedule } }
    )
      .execute()
  }

  static setDefaultStaticAnchorDate(study) {

    const studyId = study._id

    if (!studyId) return

    const now = new Date()
      .toISOString()

    const date = study.created || now

    const formattedDate = moment(date)
    // Workaround for effect where, for UTC negative offset timezones like UTC -7,the study will be created "tomorrow"
      .subtract(1, 'days')
      .format('YYYY-MM-DD')

    const uniqueIdentifier = 'Study Creation Date'

    const defaultStaticAnchorDate = {
      c_identifier: uniqueIdentifier,
      c_static_date: formattedDate,
      c_study: studyId,
      c_type: STATIC
    }

    const defaultTemplateCursor = AnchorDateTemplates
      // it is safe to search by identifier because identifiers will become unique after AXONCONFIG-1252
      .find({
        c_identifier: uniqueIdentifier,
        c_study: studyId
      })
      .skipAcl()
      .grant('read')

    if (!defaultTemplateCursor.hasNext()) {

      AnchorDateTemplates
        .insertOne(defaultStaticAnchorDate)
        .skipAcl()
        .grant('create')
        .execute()

    }

  }

  static createDeactivationPatientFlag(studyId) {
    return org.objects.c_patient_flag.insertOne({
      c_identifier: 'c_axon_participant_deactivated',
      c_label: 'Participant Deactivation Flag',
      c_study: studyId
    })
      .skipAcl()
      .grant(consts.accessLevels.script)
      .lean(false)
      .bypassCreateAcl()
      .execute()
  }

}

module.exports = StudyLibrary