/***********************************************************
 @script     eConsent - eConsent Library
 @brief      Desc
 @author     Fiachra Matthews
 (c)2020 Medable, Inc.  All Rights Reserved.
 ***********************************************************/

import { as, acl } from 'decorators'
import notifications from 'notifications'
import moment from 'moment.timezone'
import connections from 'connections'
import _ from 'lodash'
import faults from 'c_fault_lib'
import { Job } from 'renderer'
import { DocumentProcessor } from 'ec__document_processor'
import EconsentUtilities from 'ec__econsent_utilities_lib'
import axonScriptLib from 'c_axon_script_lib'
import { SsoLibrary } from 'ec__sso_lib'
import config from 'config'
import http from 'http'
import logger from 'logger'

const {
  accounts,
  ec__document_invites,
  ec__signed_documents,
  c_studies,
  ec__document_templates,
  ec__document_data,
  c_public_users,
  c_sites,
  orgs,
  c_site_users,
  c_caregiver_relationship
} = org.objects
const { accessLevels } = consts

const SIGN_METHOD = {
  sso: 'sso',
  credentials: 'credentials'
}

if (!String.prototype.padStart) {
  // eslint-disable-next-line no-extend-native
  String.prototype.padStart = function padStart(targetLength, padString) {
    targetLength = targetLength >> 0
    padString = String((typeof padString !== 'undefined' ? padString : ' '))
    if (this.length > targetLength) {
      return String(this)
    } else {
      targetLength = targetLength - this.length
      if (targetLength > padString.length) {
        padString += padString.repeat(targetLength / padString.length)
      }
      return padString.slice(0, targetLength) + String(this)
    }
  }
}

class EconsentLibrary {

  static enrollSubject(signedDoc) {
    if (signedDoc.ec__primary_participant) {
      const { _id } = signedDoc.ec__primary_participant
      const study = c_studies.find()
        .skipAcl()
        .grant(accessLevels.read)
        .paths('c_subject_enrollment_status')
        .next()
      const primaryParticipant = c_public_users.find({ _id })
        .skipAcl()
        .grant(accessLevels.read)
        .paths('c_type')
        .next()
      if (primaryParticipant && primaryParticipant.c_type === 'caregiver') {
        const caregiverRelationshipCursor = c_caregiver_relationship.find({
          c_caregivers_info: {
            $elemMatch: {
              c_public_user: _id
            }
          }
        })
          .skipAcl()
          .grant(accessLevels.read)
          .paths('c_client')
        if (caregiverRelationshipCursor.hasNext()) {
          const caregiverRelationship = caregiverRelationshipCursor.next()
          if (caregiverRelationship.c_client) {
            c_public_users.updateOne(
              { _id: caregiverRelationship.c_client._id },
              { $set: { c_status: study.c_subject_enrollment_status } }
            )
              .skipAcl()
              .grant(accessLevels.update)
              .execute()
          }
        }
      } else {
        c_public_users.updateOne({ _id }, { $set: { c_status: study.c_subject_enrollment_status } })
          .skipAcl()
          .grant(accessLevels.update)
          .execute()
      }
    }
  }

  static updateAcceptedSigners(accountId, signedDocId, signerRoleStr) {
    const signedDoc = ec__signed_documents.find({ _id: signedDocId })
      .paths('ec__accepted_signers')
      .skipAcl()
      .grant(accessLevels.read)
      .next()
    const acceptedSigner = signedDoc.ec__accepted_signers.find(v => v.ec__signer_role === signerRoleStr)
    if (acceptedSigner) {
      if (!acceptedSigner.ec__account._id.equals(accountId)) {
        ec__signed_documents.updateOne({ _id: signedDocId }, { $set: { ec__accepted_signers: [{ _id: acceptedSigner._id, ec__active: false, ec__status: 'cancelled' }] }, $push: { ec__accepted_signers: { ec__account: accountId, ec__signer_role: signerRoleStr } } })
          .skipAcl()
          .grant(accessLevels.update)
          .execute()
      }
    } else {
      ec__signed_documents.updateOne({ _id: signedDocId }, { $push: { ec__accepted_signers: { ec__account: accountId, ec__signer_role: signerRoleStr } } })
        .skipAcl()
        .grant(accessLevels.update)
        .execute()
    }
  }

  static updateAcceptedSignerStatus(signedDoc, signerRole, status) {
    const { _id, ec__accepted_signers, ec__applied_signers } = signedDoc
    const signer = ec__accepted_signers.find(v => v.ec__signer_role === signerRole)
    if (signer.ec__status !== status) {
      const update = {
        ec__accepted_signers: [{
          _id: signer._id,
          ec__status: status
        }]
      }
      if (status === 'complete') {
        update.ec__applied_signers = ec__applied_signers + 1
        update.ec__accepted_signers[0].ec__completion_time = moment()
          .toISOString()
      }
      ec__signed_documents.updateOne({ _id }, { $set: update })
        .skipAcl()
        .grant(accessLevels.update)
        .execute()
    }
  }

  static createInviteObjects(invites, ec__document_template, ec__signed_document) {
    const existingInvites = (ec__signed_document.ec__signature_invites && ec__signed_document.ec__signature_invites.data) || []
    const existingInviteRoles = existingInvites.map(v => v.ec__signer_role)
    const newInviteRoles = invites.map(v => v.ec__signer_role)
    const templateSignerRoles = ec__document_template.ec__signer_roles
    const requiredRoles = templateSignerRoles.filter(v => v.ec__required)
    const allRequiredInvites = requiredRoles.map(v => v.ec__role)
      .reduce((a, v) => a && (existingInviteRoles.includes(v) || newInviteRoles.includes(v)), true)
    if (!allRequiredInvites) {
      faults.throw('econsent.validationError.allRequiredRolesRequired')
    }
    const inviteInstances = invites.map(invite => {
      const { ec__email, ec__signer_role, ec__mobile, c_public_user } = invite
      const sr = templateSignerRoles.find(v => v.ec__role === ec__signer_role)
      const inviteCreateData = {
        ec__pin: EconsentUtilities.generateRandomDigitSequence(6),
        ec__email: ec__email.toLowerCase(),
        ec__signer_role,
        ec__document_template: ec__document_template._id,
        ec__signed_document: ec__signed_document._id,
        ec__order: sr.ec__order || 0
      }
      if (sr.ec__signer_type === 'non-signing participant') {
        inviteCreateData.ec__status = 'complete'
      }
      if (sr.ec__signer_type === 'participant') {
        let pu = null
        if (c_public_user) {
          pu = c_public_users.readOne({ _id: c_public_user })
            .skipAcl()
            .grant(consts.accessLevels.read)
            .throwNotFound(false)
            .execute()
        } else if (!EconsentUtilities.isPtsDummyEmail(ec__email)) {
          pu = c_public_users.readOne({ c_email: ec__email })
            .skipAcl()
            .grant(consts.accessLevels.read)
            .throwNotFound(false)
            .execute()
        }
        if (pu) {
          if (pu.c_access_code) {
            inviteCreateData.ec__pin = pu.c_access_code
          } else if (!pu.c_invite || pu.c_invite === 'none') {
            const puUpdate = {
              c_access_code: inviteCreateData.ec__pin,
              c_invite: 'invited',
              c_last_invite_time: new Date()
                .toISOString()
            }
            if (c_public_user) {
              c_public_users.updateOne({ _id: c_public_user }, { $set: puUpdate })
                .skipAcl()
                .grant(consts.accessLevels.update)
                .execute()
            } else {
              c_public_users.updateOne({ c_email: ec__email }, { $set: puUpdate })
                .skipAcl()
                .grant(consts.accessLevels.update)
                .execute()
            }
          }
        }
      }
      if (ec__mobile) {
        inviteCreateData.ec__mobile = ec__mobile
      }
      return ec__document_invites.insertOne(inviteCreateData)
        .lean(false)
        .execute()
    })
    return inviteInstances
  }

  static getNextInvites(signedDocId) {
    const signedDoc = ec__signed_documents.find({ _id: signedDocId })
      .skipAcl()
      .grant(accessLevels.read)
      .expand('ec__signature_invites')
      .next()
    const invites = signedDoc.ec__signature_invites.data
    const incompleteInvites = invites.filter(v => v.ec__status !== 'complete')
      .sort((a, b) => a.ec__order - b.ec__order)
    return incompleteInvites.filter(v => v.ec__order === incompleteInvites[0].ec__order)
  }

  static sendPendingInvites(invites, ec__document_template, notificationKey = 'c_document_invite') {
    const c_study = c_studies.find()
      .skipAcl()
      .grant(accessLevels.read)
      .paths('c_name')
      .next()
    return invites.reduce((a, invite) => {
      if (invite.ec__status === 'pending') {
        const inviteData = {
          ec__pin: invite.ec__pin,
          ec__email: invite.ec__email,
          ec__signer_role: invite.ec__signer_role,
          ec__document_template: invite.ec__document_template._id,
          ec__signed_document: invite.ec__signed_document._id
        }
        if (!EconsentUtilities.isPtsDummyEmail(inviteData.ec__email)) {
          const accCursor = accounts.find({ email: inviteData.ec__email })
            .skipAcl()
            .grant(accessLevels.read)
          if (accCursor.hasNext()) {
            const acc = accCursor.next()
            EconsentLibrary.updateAcceptedSigners(acc._id, inviteData.ec__signed_document, inviteData.ec__signer_role)
            EconsentLibrary.createDocumentConnection(acc._id, inviteData.ec__signed_document)
          }

          const token = EconsentUtilities.encodeBase64Url(JSON.stringify(inviteData))
          const { appUrl } = EconsentUtilities.getAppInfo(ec__document_template, script.env.host, inviteData.ec__signer_role)
          const notificationData = { url: `https://${appUrl}`, token, c_study, orgCode: org.code }
          const locale = (ec__document_template.ec__language || 'en_US').replace('-', '_')
          notifications.send(
            notificationKey,
            notificationData,
            { recipient: inviteData.ec__email, locale }
          )
        }
        ec__document_invites.updateOne({ _id: invite._id }, { $set: { ec__status: 'sent' } })
          .skipAcl()
          .grant(accessLevels.update)
          .execute()
        a.push({ _id: invite._id })
      }
      return a
    }, [])
  }

  static createConnectionForNonSigningParticipant(signedDocId, template) {
    const signedDoc = ec__signed_documents.find({ _id: signedDocId })
      .skipAcl()
      .grant(accessLevels.read)
      .expand('ec__signature_invites')
      .next()
    const invites = signedDoc.ec__signature_invites.data
    const nonSigningParticipant = template.ec__signer_roles.find(x => x.ec__signer_type === 'non-signing participant')
    if (nonSigningParticipant) {
      const participantInvite = invites.find(v => v.ec__status === 'complete')
      const accCursor = accounts.find({ email: participantInvite.ec__email })
        .skipAcl()
        .grant(accessLevels.read)
      if (accCursor.hasNext()) {
        const acc = accCursor.next()
        EconsentLibrary.createDocumentConnection(acc._id, signedDocId)
      }
    }
  }

  static validateAllInviteData(invites, signedDoc, template) {
    EconsentLibrary.validateRequiredInvites(invites, template, signedDoc)
    // eslint-disable-next-line
    const emailValidationRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    const signerRoles = template.ec__signer_roles.map(v => v.ec__role)
    const invitedSignerRoles = invites.map(v => v.ec__signer_role)
    if (EconsentUtilities.arrayHasDuplicates(invitedSignerRoles)) {
      faults.throw('econsent.validationError.oneInvitePerSignerRole')
    }
    invites.forEach(invite => {
      if (!signerRoles.includes(invite.ec__signer_role)) {
        faults.throw('econsent.validationError.inviteSignerRoleMatchInvite')
      }
      if (!invite.ec__email || !emailValidationRegex.test(invite.ec__email)) {
        faults.throw('econsent.validationError.validEmailForInvite')
      }
      if (signedDoc) {
        if (signedDoc.ec__accepted_signers.find(v => v.ec__active && v.ec__signer_role === invite.ec__signer_role)) {
          faults.throw('econsent.invalidArgument.signerRoleExists')
        }
        const inviteExists = ec__document_invites.find({ ec__valid: true, ec__email: invite.ec__email, ec__signed_document: signedDoc._id })
          .hasNext()
        if (inviteExists) {
          faults.throw('econsent.validationError.inviteAlreadyExists')
        }
      }
    })
    const inviteEmails = invites.map(s => s.ec__email.toLowerCase())
    const deduplicatedInviteEmails = new Set(inviteEmails)
    if (inviteEmails.length !== deduplicatedInviteEmails.size) {
      faults.throw('econsent.validationError.duplicateEmailsInInvite')
    }
  }

  static checkIfTemplateIsAssignedToCurrentSite(templateId, userCurrentSite) {
    const templateSites = ec__document_templates.find({ _id: templateId })
      .skipAcl()
      .grant(accessLevels.read)
      .paths('ec__sites')
      .next()
    const isSiteAssignedToTemplate = templateSites.ec__sites.find(element => element.equals(userCurrentSite))
    if (!isSiteAssignedToTemplate) {
      faults.throw('econsent.validationError.TemplateDoesNotBelongToCurrentSite')
    }
  }

  static validateRequiredInvites(invites, ec__document_template, ec__signed_document) {
    let existingInviteRoles = []
    if (ec__signed_document) {
      const existingInvites = (ec__signed_document.ec__signature_invites && ec__signed_document.ec__signature_invites.data) || []
      existingInviteRoles = existingInvites.map(v => v.ec__signer_role)
    }
    const newInviteRoles = invites.map(v => v.ec__signer_role)
    const templateSignerRoles = ec__document_template.ec__signer_roles
    const requiredRoles = templateSignerRoles.filter(v => v.ec__required)
    const allRequiredInvites = requiredRoles.map(v => v.ec__role)
      .every(role => existingInviteRoles.includes(role) || newInviteRoles.includes(role))
    if (!allRequiredInvites) {
      faults.throw('econsent.validationError.allRequiredRolesRequired')
    }
  }

  static checkDocumentComplete(signedDocId) {
    const signedDoc = ec__signed_documents.find({ _id: signedDocId })
      .skipAcl()
      .grant(accessLevels.read)
      .expand('ec__signature_invites', 'ec__document_template')
      .next()
    const documentComplete = signedDoc.ec__signature_invites.data.reduce((allComplete, invite) => {
      return allComplete && invite.ec__status === 'complete'
    }, true)
    if (documentComplete) {
      ec__signed_documents.updateOne({ _id: signedDocId }, {
        $set: {
          ec__status: 'complete',
          ec__completion_time: moment()
            .toISOString()
        }
      })
        .skipAcl()
        .grant(accessLevels.update)
        .execute()
      this.renderPDF(signedDocId)
      if (signedDoc.ec__document_template.ec__enroll_subject) {
        this.enrollSubject(signedDoc)
      }
      this.sendDocumentCompleteEmails(signedDoc)
    }
  }

  static createDocumentConnection(accountID, ec__signed_document) {
    return script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: 'update' } }, () => {
      const targets = [{ _id: accountID, access: accessLevels.update, auto: true }]
      const appKey = EconsentUtilities.getAppKey()
      return connections.create('ec__signed_documents', ec__signed_document, targets, { skipAcl: true, grant: accessLevels.delete, skipNotification: true, connectionAppKey: appKey, forceAuto: true })
    })
  }

  @as('c_system_user', { safe: false, principal: { skipAcl: true, grant: 'update' } })
  static renderPDF(ec__signed_document) {
    const signedDoc = ec__signed_documents.find({ _id: ec__signed_document })
      .expand(
        'ec__document_template',
        'ec__signatures',
        'ec__signature_invites',
        'ec__required_data'
      )
      .skipAcl()
      .grant(accessLevels.read)
      .next()
    signedDoc.ec__document_template.ec__assets.forEach(v => {
      const readAsset = ec__document_templates.find({ _id: signedDoc.ec__document_template._id })
        .skipAcl()
        .grant(accessLevels.read)
        .pathRead(v.ec__file.path.split('/')
          .slice(4)
          .join('/'))
      v.ec__file.url = readAsset.url
    })
    signedDoc.ec__required_data.data = ec__document_data.find({ ec__signed_document })
      .skipAcl()
      .grant(accessLevels.read)
      .limit(1000)
      .toArray()
    return script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: 'update' } }, () => {
      ec__signed_documents
        .updateOne({ _id: signedDoc._id }, { $set: { ec__final_document: { content: `${ec__signed_document}_signed_consent.pdf` } } })
        .skipAcl(true)
        .grant(accessLevels.update)
        .execute()
      const ec__html = DocumentProcessor.getDocumentHtml(signedDoc)
      const pdfJob = new Job('ec__econsent')
      return pdfJob
        .addTemplate('html', ec__html)
        .addOutput('consentFile', 'pdf', ['html'])
        .addFileTarget(`ec__signed_document/${signedDoc._id}/ec__final_document`, {
          facets: {
            content: 'consentFile'
          }
        })
        .start()
    })
  }

  static sendSignerCompleteEmail(ec__signed_document, signerRole) {
    const c_study = c_studies.find()
      .skipAcl()
      .grant(accessLevels.read)
      .paths('c_name')
      .next()
    const { appUrl, documentPath } = EconsentUtilities.getAppInfo(ec__signed_document.ec__document_template, script.env.host, signerRole)
    const notificationData = {
      baseUrl: `https://${appUrl}`,
      ec__signed_document: {
        _id: ec__signed_document._id
      },
      c_study,
      orgCode: org.code,
      documentPath
    }
    const locale = (ec__signed_document.ec__document_template.ec__language || 'en_US').replace('-', '_')
    notifications.send(
      'c_document_signer_complete',
      notificationData,
      { recipient: script.principal._id, locale }
    )
  }

  static sendDocumentCompleteEmails(ec__signed_document) {
    if (ec__signed_document.status !== 'complete') {
      const c_study = c_studies.find()
        .skipAcl()
        .grant(accessLevels.read)
        .paths('c_name')
        .next()
      ec__signed_document.ec__accepted_signers.forEach(v => {
        const { appUrl, documentPath } = EconsentUtilities.getAppInfo(ec__signed_document.ec__document_template, script.env.host, v.ec__signer_role)
        const notificationData = { baseUrl: `https://${appUrl}`, ec__signed_document: { _id: ec__signed_document._id }, c_study, orgCode: org.code, documentPath }
        const locale = (ec__signed_document.ec__document_template.ec__language || 'en_US').replace('-', '_')
        notifications.send(
          'c_document_complete',
          notificationData,
          { recipient: v.ec__account._id, locale }
        )
      })
    }
  }

  static setAxonEnrollment(email) {
    const puCursor = c_public_users.find({ c_email: email })
      .skipAcl()
      .grant(accessLevels.read)
    if (puCursor.hasNext()) {
      let publicUser = puCursor.next()
      let account = accounts.find({ email })
        .skipAcl()
        .grant(accessLevels.read)
        .next()
      const allGroup = axonScriptLib.findAllGroup(publicUser.c_study._id)
      const c_group = (publicUser.c_group && publicUser.c_group._id) || (allGroup && allGroup._id)
      const accountUpdate = {
        c_study_groups: [c_group],
        c_enrollments: [{
          c_joined: moment()
            .utc()
            .format(),
          c_study: publicUser.c_study._id,
          c_group
        }]
      }
      if (publicUser.c_locale && account.locale !== publicUser.c_locale) {
        accountUpdate.locale = publicUser.c_locale
      }
      if (publicUser.c_tz && account.tz !== publicUser.c_tz) {
        accountUpdate.tz = publicUser.c_tz
      }
      account = accounts.updateOne({ _id: account._id }, { $set: accountUpdate })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .lean(false)
        .execute()
      const publicUserUpdate = {
        c_account: account._id,
        c_state: 'authorized',
        c_invite: 'accepted',
        c_group
      }
      publicUser = c_public_users.updateOne({ _id: publicUser._id }, { $set: publicUserUpdate })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .lean(false)
        .execute()
      return { account, publicUser }
    }
  }

  @acl('role', ['administrator', 'c_axon_site_user', 'c_site_user', 'ec__document_manager'])
  static voidDocument(ec__signed_document, reason) {
    if (!ec__signed_document && ec__signed_documents.find({ _id: ec__signed_document })
      .skipAcl()
      .grant(accessLevels.read)
      .hasNext()) {
      faults.throw('econsent.validationError.signedDocIdMustBeValid')
    }
    if (!reason) {
      faults.throw('econsent.validationError.voidingReasonRequired')
    }
    const signedDocCursor = accounts.find()
      .pathPrefix(`${script.principal._id}/ec__site_documents/${ec__signed_document}`)
    const signedDoc = signedDocCursor.hasNext() && signedDocCursor.next()
    if (!signedDoc) {
      faults.throw('cortex.accessDenied.instanceUpdate')
    }
    if (EconsentUtilities.hasRole(signedDoc.accessRoles, 'Administrator') || EconsentUtilities.hasRole(signedDoc.accessRoles, 'c_axon_site_user') ||
     EconsentUtilities.hasRole(signedDoc.accessRoles, 'c_site_user') || EconsentUtilities.hasRole(signedDoc.accessRoles, 'ec__document_manager')) {
      const update = {
        audit: {
          message: reason
        },
        ec__cancellation_reason: reason
      }
      if (signedDoc.ec__status === 'sent') {
        update.ec__status = 'cancelled'
      } else if (signedDoc.ec__status === 'partial' || signedDoc.ec__status === 'complete') {
        update.ec__status = 'voided'
      } else {
        faults.throw('econsent.invalidArgument.documentAlreadyVoided')
      }
      return ec__signed_documents.updateOne({ _id: signedDoc._id }, { $set: update })
        .skipAcl()
        .grant(accessLevels.update)
        .lean(false)
        .execute()
    } else {
      faults.throw('cortex.accessDenied.instanceUpdate')
    }
  }

  @acl('role', ['administrator', 'support', 'c_study_designer'])
  static assignSites(accId, sites) {
    return script.as(script.principal._id, { safe: false, principal: { skipAcl: true, grant: 'script' } }, () => {
      const account = accounts.readOne({ _id: accId })
        .paths('c_site_access_list')
        .execute()
      const sitesUpdate = new Set(account.c_site_access_list || [])
      sites.forEach(v => {
        c_sites.find({ _id: v })
          .paths('_id')
          .next()
        sitesUpdate.add(v)
      })
      accounts.updateOne({ _id: accId }, { $set: { c_site_access_list: [...sitesUpdate] } })
        .execute()
      return true
    })
  }

  @acl('role', ['administrator', 'support', 'c_study_designer'])
  static unassignSites(accId, sites) {
    return script.as(script.principal._id, { safe: false, principal: { skipAcl: true, grant: 'script' } }, () => {
      const account = accounts.readOne({ _id: accId })
        .paths('c_site_access_list')
        .execute()
      const c_site_access_list = (account.c_site_access_list || []).filter(v => !sites.includes(v.toString()))
      accounts.updateOne({ _id: accId }, { $set: { c_site_access_list } })
        .execute()
      return true
    })
  }

  static validateInvite(token) {
    const inviteData = JSON.parse(EconsentUtilities.decodeBase64Url(token))
    let inv = null
    if (inviteData.ec__document_invite) {
      const inviteCursor = ec__document_invites.find({ _id: inviteData.ec__document_invite })
        .skipAcl()
        .grant(accessLevels.read)
      if (inviteCursor.hasNext()) {
        const foundInvite = inviteCursor.next()
        if (foundInvite.ec__pin === inviteData.ec__pin) {
          inv = foundInvite
        }
      }
    } else {
      const inviteCursor = ec__document_invites.find(inviteData)
        .skipAcl()
        .grant(accessLevels.read)
      inv = inviteCursor.hasNext() && inviteCursor.next()
    }
    if (inv && inv.ec__valid) {
      if (EconsentUtilities.isPtsDummyEmail(inv.ec__email)) {
        return {
          ec__requires_registration: false
        }
      }
      return {
        ec__requires_registration: !accounts.find({ email: inv.ec__email })
          .skipAcl()
          .grant(accessLevels.read)
          .hasNext()
      }
    } else {
      return faults.throw('econsent.invalidArgument.invalidInvite')
    }
  }

  static getAuthUrl() {
    const iamUrlsMapping = config.get('ec__iam_urls')
    const currentEnvironment = script.env.host
    let authEndpoint = ''
    if (iamUrlsMapping.permanentEnvs[currentEnvironment]) {
      authEndpoint = iamUrlsMapping.permanentEnvs[currentEnvironment]
    } else {
      const ephemeralEnv = currentEnvironment.split('.')[1]
      authEndpoint = iamUrlsMapping.ephemeralEnvs[ephemeralEnv]
    }
    return `${authEndpoint}/v1/login`
  }

  static getAndValidateAccount(password, username, ssoCode) {
    const identifier = username || script.principal.email
    if (ssoCode) {
      const isCodeValid = SsoLibrary.checkIfSsoCodeValid(ssoCode)
      if (!isCodeValid) {
        faults.throw('econsent.invalidArgument.invalidSsoCode')
      }
    } else {
      const { c_pinned_version } = org.objects.c_study.find()
        .next()
      if (c_pinned_version >= 40000) {
        const authUrl = this.getAuthUrl()
        try {
          const authResponse = http.post(authUrl, {
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: identifier,
              password
            })
          })
          if (![200, 201].includes(authResponse.statusCode)) {
            faults.throw('econsent.accessDenied.passwordAuthFailed')
          }
        } catch (err) {
          try {
            accounts.attemptAuth(identifier, password)
          } catch (err) {
            faults.throw('econsent.accessDenied.passwordAuthFailed')
          }
        }
      } else {
        try {
          accounts.attemptAuth(identifier, password)
        } catch (err) {
          faults.throw('econsent.accessDenied.passwordAuthFailed')
        }
      }
    }
    const account = accounts.find({ $or: [{ email: identifier }, { username: identifier }] })
      .skipAcl()
      .grant(4)
      .next()
    if (!account._id.equals(script.principal._id)) {
      faults.throw('econsent.validationError.credentialsDoNoTMatchLoggedInUser')
    }
    return account
  }

  static signDocument(ec__signed_document, password, ec__signature_identifier, signed_initials, signed_name, signed_date, username, ssoCode) {
    const account = this.getAndValidateAccount(password, username, ssoCode)
    const ec__sign_method = ssoCode ? SIGN_METHOD.sso : SIGN_METHOD.credentials
    const signedDoc = ec__signed_documents.find({ _id: ec__signed_document })
      .skipAcl()
      .grant(accessLevels.read)
      .expand('ec__signatures', 'ec__document_template')
      .next()
    const requestedSignature = signedDoc.ec__document_template.ec__requested_signatures.find(v => v.ec__key === ec__signature_identifier)
    if (!requestedSignature) {
      faults.throw('econsent.validationError.noMatchingDataId')
    }
    const acceptedSigner = signedDoc.ec__accepted_signers.find(v => v.ec__account._id.equals(script.principal._id))
    if (!acceptedSigner) {
      faults.throw('econsent.validationError.userNotAcceptedSigner')
    }
    if (acceptedSigner.ec__signer_role !== requestedSignature.ec__signer_role) {
      faults.throw('econsent.validationError.userNotCorrectRole')
    }
    if (acceptedSigner.ec__status === 'complete') {
      faults.throw('econsent.validationError.cannotUpdateCompletedSigner')
    }
    if (!(signedDoc.ec__signatures && signedDoc.ec__signatures.data.find(v => v.value.ec__signature_identifier === ec__signature_identifier))) {
      signed_name = signed_name || `${account.name.first} ${account.name.last}`
      signed_date = signed_date || moment()
        .toISOString()
      const requestedSignatureData = _.pick(requestedSignature, 'ec__signer_role', 'ec__title', 'ec__description', 'ec__initials', 'ec__custom_data', 'ec__label')
      const signature = {
        signer: signed_name,
        date: signed_date,
        value: {
          signed: true,
          ec__signature_identifier,
          ec__sign_method,
          ...requestedSignatureData
        }
      }
      if (signed_initials) {
        signature.value.signed_initials = signed_initials
      }
      EconsentLibrary.updateAcceptedSignerStatus(signedDoc, acceptedSigner.ec__signer_role, 'partial')
      const update = { $push: { ec__signatures: signature } }
      if (signedDoc.ec__status === 'sent') {
        update.$set = { ec__status: 'partial' }
      }
      return script.as(script.principal, { principal: { roles: [consts.administrator], grant: consts.accessLevels.update, skipAcl: true } }, () => {
        return ec__signed_documents.updateOne({ _id: signedDoc._id }, update)
          .skipAcl()
          .grant(accessLevels.update)
          .lean(false)
          .execute()
      })
    } else {
      return 'already signed'
    }
  }

  static setDocumentData(ec__signed_document, ec__identifier, type, ec__value) {
    const signedDoc = ec__signed_documents.find({ _id: ec__signed_document })
      .skipAcl()
      .grant(accessLevels.read)
      .expand('ec__data', 'ec__document_template', 'ec__document_template.ec__knowledge_checks')
      .next()
    const dataCursor = ec__document_data.find({ ec__signed_document, ec__identifier })
      .skipAcl()
      .grant(accessLevels.read)
    const requestedData = signedDoc.ec__document_template.ec__requested_data.find(v => v.ec__key === ec__identifier)
    const requestedKC = signedDoc.ec__document_template.ec__knowledge_checks.data.find(v => v.ec__key === ec__identifier)
    if (!requestedData && !requestedKC) {
      faults.throw('econsent.validationError.noMatchingDataId')
    }
    const acceptedSigner = signedDoc.ec__accepted_signers.find(v => v.ec__account._id.equals(script.principal._id))
    if (acceptedSigner.ec__status === 'complete') {
      faults.throw('econsent.validationError.cannotUpdateCompletedSigner')
    }
    if (!acceptedSigner) {
      faults.throw('econsent.validationError.userNotAcceptedSigner')
    }
    if (requestedData && acceptedSigner.ec__signer_role !== requestedData.ec__signer_role) {
      faults.throw('econsent.validationError.userNotCorrectRole')
    }
    if (requestedKC && acceptedSigner.ec__signer_role !== requestedKC.ec__signer_role) {
      faults.throw('econsent.validationError.userNotCorrectRole')
    }
    EconsentLibrary.updateAcceptedSignerStatus(signedDoc, acceptedSigner.ec__signer_role, 'partial')
    if (dataCursor.hasNext()) {
      const data = dataCursor.next()
      ec__document_data.updateOne({ _id: data._id }, { $set: { ec__value } })
        .skipAcl()
        .grant(accessLevels.update)
        .execute()
    } else {
      const ec__custom_data = (requestedData && requestedData.ec__custom_data) || {}
      ec__signed_documents.updateOne({ _id: ec__signed_document }, { $push: { ec__required_data: { ec__identifier, type, ec__value, ec__custom_data } } })
        .skipAcl()
        .grant(accessLevels.update)
        .execute()
    }
    return ec__signed_documents.find({ _id: ec__signed_document })
      .skipAcl()
      .grant(accessLevels.read)
      .expand('ec__signatures', 'ec__document_template')
      .next()
  }

  static completeSigner(ec__signed_document) {
    const account = accounts.find({ _id: script.principal._id })
      .skipAcl()
      .grant(accessLevels.read)
      .next()
    const signedDoc = ec__signed_documents.find({ _id: ec__signed_document })
      .skipAcl()
      .grant(accessLevels.read)
      .expand('ec__signatures', 'ec__signature_invites', 'ec__required_data', 'ec__document_template')
      .next()
    const userInvite = signedDoc.ec__signature_invites.data.find(v => v.ec__email === account.email)
    if (!userInvite) {
      faults.throw('econsent.validationError.userNotAcceptedSigner')
    }
    signedDoc.ec__required_data.data = ec__document_data.find({ ec__signed_document })
      .skipAcl()
      .grant(accessLevels.read)
      .limit(1000)
      .toArray()
    const signerRole = userInvite.ec__signer_role
    const requiredSignatures = signedDoc.ec__document_template.ec__requested_signatures.filter(v => !v.ec__optional && v.ec__signer_role === signerRole)
    const requiredData = signedDoc.ec__document_template.ec__requested_data.filter(v => !v.ec__optional && v.ec__signer_role === signerRole)
    const allRequiredSignaturesComplete = requiredSignatures.reduce((allComplete, reqSig) => {
      return allComplete && !!signedDoc.ec__signatures.data.find(v => v.value.ec__signature_identifier === reqSig.ec__key)
    }, true)
    const allRequiredDataComplete = requiredData.reduce((allComplete, reqData) => {
      return allComplete && !!signedDoc.ec__required_data.data.find(v => v.ec__identifier === reqData.ec__key)
    }, true)
    if (!allRequiredSignaturesComplete || !allRequiredDataComplete) {
      faults.throw('econsent.validationError.requiredDataRemains')
    }
    ec__document_invites.updateOne({ _id: userInvite._id }, { $set: { ec__status: 'complete' } })
      .skipAcl()
      .grant(accessLevels.update)
      .execute()
    EconsentLibrary.sendSignerCompleteEmail(signedDoc, signerRole)
    EconsentLibrary.updateAcceptedSignerStatus(signedDoc, signerRole, 'complete')
    const pendingInvites = EconsentLibrary.getNextInvites(signedDoc._id)
    if (pendingInvites && pendingInvites.length > 0) {
      EconsentLibrary.sendPendingInvites(pendingInvites, signedDoc.ec__document_template)
    }
    EconsentLibrary.checkDocumentComplete(signedDoc._id)
    return ec__signed_documents.find({ _id: ec__signed_document })
      .skipAcl()
      .grant(accessLevels.read)
      .expand('ec__signatures', 'ec__signature_invites', 'ec__required_data', 'ec__document_template')
      .next()
  }

  static completePtsDocument(ec__signed_document, ec__completion_time, ec__reason_for_change, ec__pts_signature_date_wallclock) {
    const ec_completion_time_iso = moment(ec__completion_time || ec__pts_signature_date_wallclock)
      .toISOString()
    const ec_pts_signature_date_wallclock = ec__pts_signature_date_wallclock || moment(ec__completion_time)
      .format('YYYY-MM-DD')
    const current_utc_date = moment()
      .utc()
      .format('YYYY-MM-DD')
    if (
      (!ec__completion_time && !ec__pts_signature_date_wallclock) ||
      (ec__completion_time && ec__pts_signature_date_wallclock && moment(ec__completion_time)
        .format('YYYY-MM-DD') !== ec__pts_signature_date_wallclock) ||
      moment(ec__completion_time)
        .format('YYYY-MM-DD') > current_utc_date ||
      (ec__pts_signature_date_wallclock > current_utc_date)
    ) {
      faults.throw('econsent.validationError.dateMustBeValid')
    }
    const signedDocCursor = accounts.find()
      .pathPrefix(`${script.principal._id}/ec__site_documents/${ec__signed_document}`)
      .expand('ec__signed_document', 'ec__document_template')
    const signedDoc = signedDocCursor.hasNext() && signedDocCursor.next()
    if (!signedDoc) {
      faults.throw('econsent.validationError.noAccessToSignedDocument')
    }
    const canUpdate = EconsentUtilities.hasRole(signedDoc.accessRoles, 'Administrator') || EconsentUtilities.hasRole(signedDoc.accessRoles, 'c_axon_site_user') ||
    EconsentUtilities.hasRole(signedDoc.accessRoles, 'c_site_user') || EconsentUtilities.hasRole(signedDoc.accessRoles, 'ec__document_manager')
    if (!canUpdate) {
      faults.throw('cortex.accessDenied.instanceUpdate')
    }
    if (!signedDoc.ec__document_template.ec__pts_only) {
      faults.throw('econsent.validationError.signDocumentMustBePrintToSign')
    }
    if (signedDoc.ec__status === 'complete' && (Date.parse(signedDoc.ec__completion_time) === Date.parse(ec__completion_time))) {
      faults.throw('econsent.validationError.signDocumentIsAlreadyCompleted')
    }
    if (signedDoc.ec__status === 'complete' && signedDoc.ec__completion_time && !ec__reason_for_change) {
      faults.throw('econsent.validationError.reasonForChangeRequired')
    }
    let update = {
      ec__status: 'complete',
      ec__completion_time: ec_completion_time_iso,
      ec__pts_signature_date_wallclock: ec_pts_signature_date_wallclock
    }
    if (signedDoc.ec__status === 'complete' && signedDoc.ec__completion_time) {
      update = {
        audit: {
          message: ec__reason_for_change
        },
        ec__completion_time: ec_completion_time_iso,
        ec__pts_signature_date_wallclock: ec_pts_signature_date_wallclock
      }
    }
    logger.info('Completing signed PTS document (dual-write)', { ec__signed_document: signedDoc._id, params: { ec__completion_time, ec__reason_for_change, ec__pts_signature_date_wallclock }, update })
    ec__signed_documents.updateOne({ _id: signedDoc._id }, { $set: update })
      .skipAcl()
      .grant(accessLevels.update)
      .lean(false)
      .execute()
    if (signedDoc.ec__document_template.ec__enroll_subject) {
      EconsentLibrary.enrollSubject(signedDoc)
    }
    return ec__signed_documents.find({ _id: ec__signed_document })
      .skipAcl()
      .grant(accessLevels.read)
      .next()
  }

  static register(email, password, name, mobile, token) {
    return script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: 'update' } }, () => {
      const inviteData = JSON.parse(EconsentUtilities.decodeBase64Url(token))
      let inv = null
      if (inviteData.ec__document_invite) {
        const inviteCursor = ec__document_invites.find({ _id: inviteData.ec__document_invite })
          .skipAcl()
          .grant(consts.accessLevels.read)
          .expand('ec__document_template')
        if (inviteCursor.hasNext()) {
          const foundInvite = inviteCursor.next()
          if (foundInvite.ec__pin === inviteData.ec__pin) {
            inv = foundInvite
          }
        }
      } else {
        const inviteCursor = ec__document_invites.find(inviteData)
          .skipAcl()
          .grant(consts.accessLevels.read)
          .expand('ec__document_template')
        inv = inviteCursor.hasNext() && inviteCursor.next()
      }
      if (inv) {
        if (inv.ec__valid) {
          if (EconsentUtilities.isPtsDummyEmail(inv.ec__email)) {
            return faults.throw('econsent.invalidArgument.ptsInvitesDoNotRequireRegistration')
          }
          if (email === inv.ec__email) {
            if (!accounts.find({ email: inv.ec__email })
              .skipAcl()
              .grant(accessLevels.read)
              .hasNext()) {
              const orgInfo = orgs.find()
                .skipAcl()
                .grant(consts.accessLevels.read)
                .paths('configuration')
                .next()
              const accountsInfo = orgInfo.configuration.accounts
              const isLoginMethodsAvailable = orgInfo.configuration.loginMethods
              const account = {
                email,
                password,
                name,
                ...(mobile && { mobile }),
                ...(accountsInfo.enableUsername && { username: email.replace('@', '_') })
              }
              if (isLoginMethodsAvailable) {
                account.loginMethods = ['credentials']
              }
              const newAccount = accounts.register(account, {
                skipNotification: true,
                skipVerification: true,
                verifyLocation: true
              })
              EconsentLibrary.createDocumentConnection(newAccount._id, inv.ec__signed_document._id)
              EconsentLibrary.setAxonEnrollment(newAccount.email)
              const loginBody = {
                email: newAccount.email,
                ...(newAccount.username && { username: newAccount.username })
              }
              return accounts.login(loginBody, {
                passwordLess: true
              })
            } else {
              return faults.throw('axon.invalidArgument.accountExistsForEmail')
            }
          } else {
            return faults.throw('econsent.invalidArgument.emailMustMatchInvite')
          }
        } else {
          return faults.throw('econsent.invalidArgument.invalidInvite')
        }
      } else {
        return faults.throw('econsent.invalidArgument.referencedInviteDoesNotExist')
      }
    })
  }

  @acl('role', ['administrator', 'c_axon_site_user', 'c_site_user', 'ec__document_manager'])
  static getSignerAppLink(inviteId) {
    const invite = ec__document_invites.find({ _id: inviteId })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next()
    const signedDoc = accounts.find({ _id: script.principal._id })
      .expand('ec__document_template')
      .paths('ec__document_template.ec__signer_roles')
      .pathRead(`ec__site_documents/${invite.ec__signed_document._id}`)
    if (!signedDoc) {
      faults.throw('cortex.accessDenied.instanceRead')
    }
    const { appUrl } = EconsentUtilities.getAppInfo(signedDoc.ec__document_template, script.env.host, invite.ec__signer_role)
    let inviteData
    if (EconsentUtilities.isPtsDummyEmail(invite.ec__email)) {
      inviteData = {
        ec__document_invite: invite._id,
        ec__pin: invite.ec__pin
      }
    } else {
      inviteData = {
        ec__pin: invite.ec__pin,
        ec__email: invite.ec__email,
        ec__signer_role: invite.ec__signer_role,
        ec__document_template: invite.ec__document_template._id,
        ec__signed_document: invite.ec__signed_document._id
      }
    }
    const token = EconsentUtilities.encodeBase64Url(JSON.stringify(inviteData))
    return {
      signerAppLink: `https://${appUrl}/invite/${token}`
    }
  }

  static isDuplicateTitle(title) {
    const titleRegex = new RegExp(`^${title}$`, 'i')
    return org.objects.ec__document_template.find({ ec__title: titleRegex, ec__status: { $in: ['draft', 'published'] } })
      .hasNext()
  }

  static getECSiteSigners(siteId) {
    const allowedRoles = ['Axon Site User', 'Axon Site Investigator'].map(role => consts.roles[role])
    return accounts.find({ c_site_access_list: siteId, roles: { $in: allowedRoles } })
      .skipAcl()
      .grant('read')
      .limit(1000)
      .map(account => {
        return {
          c_account: {
            _id: account._id,
            email: account.email,
            name: account.name
          },
          _id: account._id
        }
      })
  }

  static buildInvites(oldInvites, oldEmail, newEmail) {
    const invites = []
    oldInvites.forEach(oldInvite => {
      const invite = {
        ec__email: oldInvite.ec__email === oldEmail ? newEmail : oldInvite.ec__email,
        ec__signer_role: oldInvite.ec__signer_role,
        ec__order: oldInvite.ec__order
      }
      invites.push(invite)
    })
    return invites
  }

  static invalidateInvites(invites) {
    invites.forEach(invite => {
      ec__document_invites.updateOne({ _id: invite._id }, { $set: { ec__valid: false } })
        .skipAcl()
        .grant(accessLevels.update)
        .execute()
    })
  }

  static createNewDocumentInvites(previousSignedDocument, previousDocumentInvites, oldEmail, newEmail) {
    let notificationKey = 'c_document_invite'
    const template = ec__document_templates.find({ _id: previousSignedDocument.ec__document_template._id })
      .skipAcl()
      .grant(accessLevels.read)
      .next()
    const docCreate = {
      ec__study: previousSignedDocument.ec__study._id,
      ec__document_template: previousSignedDocument.ec__document_template._id,
      ec__required_signers: previousSignedDocument.ec__required_signers,
      ec__pts: previousSignedDocument.ec__pts_only,
      ec__site: previousSignedDocument.ec__site._id
    }
    if (template.ec__pts_only) {
      notificationKey = 'c_pts_document_invite'
      docCreate.ec__status = 'partial'
      docCreate.ec__primary_participant = previousSignedDocument.ec__primary_participant._id
    }
    const signedDoc = ec__signed_documents.insertOne(docCreate)
      .lean(false)
      .skipAcl()
      .grant(accessLevels.update)
      .execute()
    const newInvites = this.buildInvites(previousDocumentInvites, oldEmail, newEmail)
    this.invalidateInvites(previousDocumentInvites)
    this.createInviteObjects(newInvites, template, signedDoc)
    const pendingInvites = this.getNextInvites(signedDoc._id)
    this.createConnectionForNonSigningParticipant(signedDoc._id, template)
    const returnData = {
      ec__signed_doc: signedDoc._id,
      invites: this.sendPendingInvites(pendingInvites, template, notificationKey)
    }
    return returnData
  }

  static processDocumentInvitesForNewEmail(participantId, oldEmail, newEmail) {
    if (
      EconsentUtilities.hasRole(script.principal.roles, 'ec__document_manager') ||
      EconsentUtilities.hasRole(script.principal.roles, 'c_axon_site_user') ||
      EconsentUtilities.isSiteUser()
    ) {
      const voidMessage = 'participant email changed'
      const documentStatus = ['sent', 'partial', 'complete']
      newEmail = newEmail || oldEmail
      return script.as(script.principal._id, { safe: false, principal: { skipAcl: true, grant: 'script' } }, () => {
        const documentList = ec__signed_documents.find({
          ec__primary_participant: participantId,
          ec__status: { $in: documentStatus }
        })
          .toArray()
        documentList.forEach(document => {
          const documentInvites = ec__document_invites.find({ ec__signed_document: document._id })
            .toArray()
          if (documentStatus.includes(document.ec__status)) {
            this.voidDocument(document._id, voidMessage)
            this.createNewDocumentInvites(document, documentInvites, oldEmail, newEmail)
          }
        })
      })
    } else {
      faults.throw('cortex.accessDenied.route')
    }
  }

  // ECO-453: Grant document access when account is linked to participant (email or pin-only)
  // skipRoleCheck: true when called from triggers (participant doesn't have site roles)
  static grantDocumentAccessForParticipant(participantId, accountId, skipRoleCheck = false) {
    if (!skipRoleCheck && !(
      EconsentUtilities.hasRole(script.principal.roles, 'ec__document_manager') ||
      EconsentUtilities.hasRole(script.principal.roles, 'c_axon_site_user') ||
      EconsentUtilities.isSiteUser()
    )) {
      faults.throw('cortex.accessDenied.route')
    }
    return script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: 'update' } }, () => {
      ec__signed_documents.find({ ec__primary_participant: participantId, ec__status: { $in: ['partial', 'sent'] } })
        .paths('ec__accepted_signers', 'ec__document_template')
        .skipAcl()
        .grant(consts.accessLevels.read)
        .forEach(doc => {
          if (!doc.ec__document_template) return
          const tpl = ec__document_templates.find({ _id: doc.ec__document_template._id })
            .paths('ec__signer_roles')
            .skipAcl()
            .grant(consts.accessLevels.read)
            .next()
          if (!tpl || !tpl.ec__signer_roles) return
          const role = tpl.ec__signer_roles.find(v => v.ec__signer_type === 'participant' || v.ec__signer_type === 'non-signing participant')
          if (!role) return
          const hasAccess = doc.ec__accepted_signers && doc.ec__accepted_signers.some(v => {
            const aid = v.ec__account && (v.ec__account._id || v.ec__account)
            return aid && String(aid) === String(accountId)
          })
          if (!hasAccess) {
            ec__signed_documents.updateOne({ _id: doc._id }, {
              $push: {
                ec__accepted_signers: {
                  ec__account: accountId,
                  ec__signer_role: role.ec__role,
                  ec__active: true,
                  ec__status: 'connected'
                }
              }
            })
              .skipAcl()
              .grant(consts.accessLevels.update)
              .execute()
            this.createDocumentConnection(accountId, doc._id)
          }
        })
    })
  }

  static voidUncompletedDocuments(participantId, voidMessage) {
    if (
      EconsentUtilities.hasRole(script.principal.roles, 'ec__document_manager') ||
      EconsentUtilities.hasRole(script.principal.roles, 'c_axon_site_user') ||
      EconsentUtilities.isSiteUser()
    ) {
      const uncompletedStatus = ['sent', 'partial']
      return script.as(script.principal._id, { safe: false, principal: { skipAcl: true, grant: 'script' } }, () => {
        const documentList = ec__signed_documents.find({
          ec__primary_participant: participantId,
          ec__status: { $in: uncompletedStatus }
        })
          .toArray()
        documentList.forEach(document => {
          if (uncompletedStatus.includes(document.ec__status)) {
            this.voidDocument(document._id, voidMessage)
          }
        })
      })
    } else {
      faults.throw('cortex.accessDenied.route')
    }
  }

}

module.exports = EconsentLibrary