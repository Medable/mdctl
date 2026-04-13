import faults from 'c_fault_lib'
import { AltRegMethodsLibrary } from 'c_axon_alt_reg_methods'

const { accounts, c_groups, c_public_users, c_sites, c_visit_schedules, c_studies } = org.objects

export class ValidatorsBase {

  // eslint-disable-next-line no-useless-escape
  static emailValidationRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/

  static validateRouteParams() {
    throw new TypeError('Pure Virtual Function Call')
  }

  // #region GeneralValidators
  static validateRequiredParam(param, errorCode) {
    if (!param) {
      faults.throw(errorCode)
    }
  }
  // #endregion

  // #region ParticipantValidators
  static validateParticipantCanBeInvited(c_public_user, locale) {
    const publicUserCursor = AltRegMethodsLibrary.cursorForOne(c_public_users, { _id: c_public_user })
      .locale(locale)
    if (!publicUserCursor.hasNext()) {
      faults.throw('axon.invalidArgument.validSubjectRequired')
    }
    const publicUser = publicUserCursor.next()
    if (publicUser.c_account) {
      faults.throw('axon.invalidArgument.subjectRegistered')
    }
    return publicUser
  }
  // #endregion

  // #region StudyValidators
  static validateStudyRequiresInvite(studyRequiresInvite) {
    if (!studyRequiresInvite) {
      faults.throw('axon.validationError.studyInviteNotRequired')
    }
  }

  static validateStudyTaskIdandEventId(study, c_task, c_event) {
    if (study && study.c_use_advanced_task_scheduler && (!c_task || !c_event)) {
      faults.throw('axon.invalidArgument.bothTaskIdAndEventIdRequired')
    }
  }

  // #endregion

  // #region LocaleValidators
  static validateInviteLocale(study, locale, site) {
    // if locale not specified then default study, otherwise to
    if (!locale) {
      const studyLocale = study.c_supported_locales && study.c_supported_locales[0]
      const orgLocale = org.objects.org.find()
        .next().locale
      return studyLocale || orgLocale
    } else {
      if (!study.c_supported_locales.includes(locale)) {
        faults.throw('axon.invalidArgument.validLocaleRequired')
      }

      site = site && AltRegMethodsLibrary.cursorForOne(c_sites, { _id: site })
        .paths('c_supported_locales')
        .next()
      if (site && site.c_supported_locales.length > 0 && !site.c_supported_locales.includes(locale)) {
        faults.throw('axon.invalidArgument.validLocaleRequired')
      }
      return locale
    }
  }
  // #endregion

  // #region GroupValidators
  static validateGroup(c_group) {
    if (!c_group) {
      // faults.throw('axon.invalidArgument.validGroupRequired')
      return
    }
    if (!AltRegMethodsLibrary.hasAtleastOneResult(c_groups, { _id: c_group })) {
      faults.throw('axon.invalidArgument.validGroupRequired')
    }
  }
  // #endregion

  // #region SiteValidators
  static validateSite(c_site) {
    if (c_site && !AltRegMethodsLibrary.hasAtleastOneResult(c_sites, { _id: c_site })) {
      faults.throw('axon.invalidArgument.validSiteRequired')
    }
  }
  // #endregion

  // #region VisitScheduleValidators
  static validateVisitSchedule(c_visit_schedule) {
    if (c_visit_schedule && !AltRegMethodsLibrary.hasAtleastOneResult(c_visit_schedules, { _id: c_visit_schedule })) {
      faults.throw('axon.invalidArgument.validVisitScheduleRequired')
    }
  }
  // #endregion

  // #region EmailValidators
  static validateEmailRegex(email) {
    if (!this.emailValidationRegex.test(email)) {
      faults.throw('axon.invalidArgument.validEmailRequired')
    }
  }

  static validateEmailAccountExists(email) {
    if (AltRegMethodsLibrary.hasAtleastOneResult(accounts, { email })) {
      faults.throw('axon.invalidArgument.accountExistsForEmail')
    }
  }

  static validateInviteSentToEmail(email) {
    if (AltRegMethodsLibrary.hasAtleastOneResult(c_public_users, { c_email: email, c_invite: 'invited' })) {
      faults.throw('axon.invalidArgument.InviteAlreadySent')
    }
  }
  // #endregion

}

class InviteUsersValidators extends ValidatorsBase {

  static routeName = 'c_axon_invite_users'

  static validateRouteParams(c_group, emails, c_mobile, c_site, c_visit_schedule) {
    this.validateGroup(c_group)
    let email = null
    if (emails) {
      emails = (Array.isArray(emails) ? emails : [emails]).map(e => e.toLowerCase())
      email = emails[0]
      emails.forEach(email => {
        this.validateEmailRegex(email)
        this.validateEmailAccountExists(email)
        this.validateInviteSentToEmail(email)
      })
    }
    let mobile = null
    if (c_mobile) {
      mobile = c_mobile
    }
    this.validateSite(c_site)
    this.validateVisitSchedule(c_visit_schedule)

    return { email, mobile }
  }

}

class StudySubjectInfoValidators extends ValidatorsBase {

  static routeName = 'c_axon_hybrid_subject_info'

  static validateRouteParams(c_study) {
    if (!c_study) {
      faults.throw('axon.invalidArgument.validStudyRequired')
    }

    const studyCursor = c_studies.find({ _id: c_study })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .expand('c_groups')

    if (!studyCursor.hasNext()) {
      faults.throw('axon.invalidArgument.validStudyRequired')
    }
    const study = studyCursor.next()
    const groups = c_groups.find({ c_study: study._id })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    return { study, groups }
  }

}

class ResendInviteValidators extends ValidatorsBase {

  static routeName = 'c_axon_hybrid_resend_invite'

  static validateRouteParams(c_public_user, c_site, locale) {
    const searchQuery = { _id: c_public_user }

    // We have to ensure that this user can only make requests from the site or study that they are using so we add them to the search query
    // for the public user
    if (c_site) {
      // set query to check on the site
      if (c_sites.find({ _id: c_site })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .hasNext()) {
        searchQuery.c_site = c_site
      } else {
        faults.throw('axon.invalidArgument.validSiteRequired')
      }

    }

    // The search query process is primarily to stop a site user from one site resending an invite for a user of another
    const publicUserCursor = c_public_users.find(searchQuery)
      .limit(1)
      .skipAcl()
      .grant(consts.accessLevels.read)

    if (!c_public_user || !publicUserCursor.hasNext()) {
      faults.throw('axon.invalidArgument.validSubjectRequired')
    }

    const publicUser = publicUserCursor.next(),
          study = c_studies.find()
            .locale(locale)
            .skipAcl()
            .grant(consts.accessLevels.read)
            .next()

    return { publicUser, study }
  }

}

export const AltRegMethodsValidators = {
  [InviteUsersValidators.routeName]: InviteUsersValidators,
  [StudySubjectInfoValidators.routeName]: StudySubjectInfoValidators,
  [ResendInviteValidators.routeName]: ResendInviteValidators
}