import faults from 'c_fault_lib'

const {
  c_sites
} = org.objects

/**
 * Simple universal validator for invite and registration
 *
 * Rules:
 * - Pre-5.2: Use c_login_identifier (email or username)
 * - R5.2+ with strict no-PII site: Require username, reject email
 * - R5.2+ without strict no-PII site: Email optional, can use username
 */
class RegistrationValidator {

  /**
   * Check if site has strict no-PII for R5.2+ studies
   */
  static isStrictNoPiiSite(study, siteIdOrObject) {
    if (!study || study.c_pinned_version < 50200) {
      return false
    }

    if (!siteIdOrObject) {
      return false
    }

    const siteId = typeof siteIdOrObject === 'string' ? siteIdOrObject : siteIdOrObject._id
    if (!siteId) {
      return false
    }

    const site = c_sites.find({ _id: siteId })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('c_no_pii')
      .next()

    return site && site.c_no_pii === true
  }

  /**
   * Check if PII fields (email, name, mobile) should be bypassed during registration
   * Bypass applies when:
   * - Site is strict no-PII (R5.2+ only)
   * - Study is no-PII (any version)
   * - Invite was pin-only (no email and no username)
   */
  static shouldBypassPiiFields(study, siteIdOrObject, publicUser) {
    // Check if site is strict no-PII (R5.2+ only)
    const isStrictNoPiiSite = this.isStrictNoPiiSite(study, siteIdOrObject)

    // Check if study is no-PII (any version)
    const isStudyNoPii = study && study.c_no_pii === true

    // Check if invite was pin-only (no email and no username)
    const inviteEmail = publicUser && publicUser.c_email && publicUser.c_email.trim()
    const inviteUsername = publicUser && publicUser.c_username && publicUser.c_username.trim()
    const isPinOnlyInvite = !inviteEmail && !inviteUsername

    return isStrictNoPiiSite || isStudyNoPii || isPinOnlyInvite
  }

  /**
   * Validate invite inputs
   * Returns: { isEmailBased: boolean }
   */
  static validateInvite(study, siteIdOrObject, email, username) {
    const isR52Plus = study && study.c_pinned_version >= 50200

    if (!isR52Plus) {
      return this._validatePre52Invite(study, email, username)
    }

    return this._validateR52PlusInvite(study, siteIdOrObject, email, username)
  }

  /**
   * Validate invite for pre-5.2 studies
   */
  static _validatePre52Invite(study, email, username) {
    const isEmailBased = study.c_login_identifier === 'email'

    if (isEmailBased) {
      if (username) {
        faults.throw('axon.invalidArgument.wrongIdentifierTypeForStudy')
      }
    } else {
      if (email) {
        faults.throw('axon.invalidArgument.wrongIdentifierTypeForStudy')
      }
    }

    return { isEmailBased }
  }

  /**
   * Validate invite for R5.2+ studies
   */
  static _validateR52PlusInvite(study, siteIdOrObject, email, username) {
    const strictNoPii = this.isStrictNoPiiSite(study, siteIdOrObject)

    if (strictNoPii) {
      if (email) {
        faults.throw('axon.invalidArgument.emailNotAllowedForStrictNoPiiSite')
      }
      return { isEmailBased: false }
    }

    // Non-strict: Allow email, username, or empty (pin-only), but not both
    if (email && username) {
      faults.throw('axon.invalidArgument.cannotUseBothIdentifiers')
    }

    // If both are provided, prefer email; if only username, use username; if neither, default to email-based
    return { isEmailBased: !username || !!email }
  }

  /**
   * Validate registration inputs
   * Returns: { isEmailBased: boolean, shouldUseEmail: boolean, shouldUseUsername: boolean }
   */
  static validateRegistration(study, siteIdOrObject, publicUser, regEmail, regUsername) {
    const isR52Plus = study && study.c_pinned_version >= 50200

    if (!isR52Plus) {
      return this._validatePre52(study, publicUser, regEmail, regUsername)
    }

    return this._validateR52Plus(study, siteIdOrObject, publicUser, regEmail, regUsername)
  }

  /**
   * Validate registration for pre-5.2 studies
   */
  static _validatePre52(study, publicUser, regEmail, regUsername) {
    const isEmailBased = study.c_login_identifier === 'email'

    if (isEmailBased) {
      const inviteEmail = publicUser.c_email && publicUser.c_email.trim()
      if (inviteEmail) {
        this._assertEmailMatch(inviteEmail, regEmail, regUsername)
      }
    } else {
      const inviteUsername = publicUser.c_username && publicUser.c_username.trim()
      if (inviteUsername) {
        this._assertUsernameMatch(inviteUsername, regEmail, regUsername)
      }
    }

    return {
      isEmailBased,
      shouldUseEmail: isEmailBased,
      shouldUseUsername: !isEmailBased
    }
  }

  /**
   * Validate registration for R5.2+ studies
   */
  static _validateR52Plus(study, siteIdOrObject, publicUser, regEmail, regUsername) {
    const inviteEmail = publicUser.c_email && publicUser.c_email.trim()
    const inviteUsername = publicUser.c_username && publicUser.c_username.trim()

    if (inviteEmail) {
      this._assertEmailMatch(inviteEmail, regEmail, regUsername)
      return {
        isEmailBased: true,
        shouldUseEmail: true,
        shouldUseUsername: false
      }
    }

    if (inviteUsername) {
      this._assertUsernameMatch(inviteUsername, regEmail, regUsername)
      return {
        isEmailBased: false,
        shouldUseEmail: false,
        shouldUseUsername: true
      }
    }

    // Pin-only invite (no email or username in invite)
    return this._validatePinOnly(study, siteIdOrObject, regEmail, regUsername)
  }

  /**
   * Assert that registration email matches invite email
   */
  static _assertEmailMatch(inviteEmail, regEmail, regUsername) {
    if (regUsername) {
      faults.throw('axon.invalidArgument.noInviteForEmail')
    }
    if (!regEmail || !regEmail.trim()) {
      faults.throw('axon.invalidArgument.emailRequired')
    }
    if (regEmail.toLowerCase() !== inviteEmail.toLowerCase()) {
      faults.throw('axon.invalidArgument.noInviteForEmail')
    }
  }

  /**
   * Assert that registration username matches invite username
   */
  static _assertUsernameMatch(inviteUsername, regEmail, regUsername) {
    if (regEmail) {
      faults.throw('axon.invalidArgument.noInviteForUsername')
    }
    if (!regUsername || !regUsername.trim()) {
      faults.throw('axon.invalidArgument.usernameRequired')
    }
    if (regUsername.toLowerCase() !== inviteUsername.toLowerCase()) {
      faults.throw('axon.invalidArgument.noInviteForUsername')
    }
  }

  /**
   * Validate registration for pin-only invites (no email or username in invite)
   */
  static _validatePinOnly(study, siteIdOrObject, regEmail, regUsername) {
    const strictNoPii = this.isStrictNoPiiSite(study, siteIdOrObject)

    if (regEmail) {
      if (strictNoPii) {
        faults.throw('axon.invalidArgument.emailNotAllowedForStrictNoPiiSite')
      }
      faults.throw('axon.invalidArgument.noInviteForEmail')
    }

    if (!regUsername || !regUsername.trim()) {
      faults.throw('axon.invalidArgument.usernameRequired')
    }

    return {
      isEmailBased: false,
      shouldUseEmail: false,
      shouldUseUsername: true
    }
  }

}

module.exports = RegistrationValidator