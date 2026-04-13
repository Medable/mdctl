import config from 'config'
import { route, log, trigger } from 'decorators'
import _ from 'underscore'
import faults from 'c_fault_lib'
import { DocumentProcessor } from 'ec__document_processor'
import { TemplateCloner } from 'ec__template_manager_lib'
import EconsentLibrary from 'ec__econsent_lib'
import EconsentUtilities from 'ec__econsent_utilities_lib'
import { SsoLibrary } from 'ec__sso_lib'
import connections from 'connections'
import { MismatchHtmlTemplateData } from 'ec__mismatch_html_and_doc_data'
import logger from 'logger'

const {
  ec__document_invites,
  ec__signed_documents,
  c_studies,
  ec__document_templates,
  ec__document_data,
  c_sites,
  c_public_users
} = org.objects
const { accessLevels } = consts
const { array: toArray } = require('util.values')

class EconsentRoutes {

  /**
   * @openapi
   * /routes/econsent/invite:
   *   post:
   *     description: 'ec__invite_consent'
   *     parameters:
   *       - name: ec__email
   *         in: body
   *         required: false
   *         description: Email address for the invite. Required for non-PTS templates. For PTS templates, can be omitted if c_public_user is provided.
   *         schema:
   *           type: string
   *       - name: c_public_user
   *         in: body
   *         required: false
   *         description: Public user _id for PTS templates. When provided for PTS, ec__email becomes optional for participant signers.
   *         schema:
   *           type: string
   *       - name: ec__document_template
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__signed_document
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__signer_role
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__mobile
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: c_site
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *     responses:
   *      '200':
   *        description: 'Send invites'
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                invites:
   *                  type: array
   *                  items:
   *                    type: object
   *                    properties:
   *                      "_id":
   *                        type: string
   *                        example: '43434njkjk4343njbh34343ghl'
   *                ec__signed_doc:
   *                  type: string
   *                  example: '7039pfhl2417ondp103846qmc'
   *
   *
   *      '400':
   *        description: error message from exception
   *
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    name: 'ec__invite_consent',
    path: 'econsent/invite',
    acl: ['role.administrator', 'role.c_axon_site_user', 'role.c_site_user', 'role.ec__document_manager']
  })
  static inviteConsent({ req, body }) {

    const { ec__email, ec__document_template, ec__signed_document, ec__signer_role, ec__mobile, c_site, c_public_user } = body()
    let { invites } = body()
    let notificationKey = 'c_document_invite'
    let site
    const siteCursor = c_sites.find({ _id: c_site })
      .skipAcl()
      .grant('read')
    if (siteCursor.hasNext()) {
      site = siteCursor.next()
      EconsentLibrary.checkIfTemplateIsAssignedToCurrentSite(ec__document_template, site._id)
    }

    const templateCursor = ec__document_template && ec__document_templates.find({ _id: ec__document_template })
      .skipAcl()
      .grant(accessLevels.read)
    const template = templateCursor && templateCursor.hasNext() && templateCursor.next()
    const signedDocCursor = ec__signed_document && ec__signed_documents.find({ _id: ec__signed_document })
      .skipAcl()
      .grant(accessLevels.read)
      .expand('ec__signature_invites')
    let signedDoc = signedDocCursor && signedDocCursor.hasNext() && signedDocCursor.next()

    if (!template) {
      faults.throw('econsent.validationError.docTemplateRequired')
    }

    if (template.ec__status !== 'published') {
      faults.throw('econsent.invalidArgument.onlyInviteToPublishedDocuments')
    }

    if (ec__signed_document && !signedDoc) {
      faults.throw('econsent.validationError.signedDocIdMustBeValid')
    }

    if (!invites) {
      invites = []
    }

    // Build single invite from top-level params if provided
    if (ec__signer_role && (ec__email || c_public_user)) {
      const invite = {
        ec__signer_role
      }

      if (ec__email) {
        invite.ec__email = ec__email
      }

      if (c_public_user) {
        invite.c_public_user = c_public_user
      }

      if (ec__mobile) {
        invite.ec__mobile = ec__mobile
      }

      invites.push(invite)
    }

    if (invites.length === 0) {
      faults.throw('econsent.validationError.oneInviteRequired')
    }

    // For PTS templates, resolve participant by c_public_user and generate dummy email if needed
    if (template.ec__pts_only) {
      const participantSignerRole = template.ec__signer_roles.find(v => ['participant', 'non-signing participant'].includes(v.ec__signer_type))

      invites = invites.map(invite => {
        const isParticipantInvite = participantSignerRole && invite.ec__signer_role === participantSignerRole.ec__role

        if (isParticipantInvite && invite.c_public_user && !invite.ec__email) {
          // Generate dummy email for PTS participant without email
          invite.ec__email = EconsentUtilities.generatePtsDummyEmail(invite.c_public_user)
        }

        return invite
      })
    }

    // Only validate invites for none-PTS docs.
    if (!template.ec__pts_only) {
      EconsentLibrary.validateAllInviteData(invites, signedDoc, template)
    }

    EconsentUtilities.validateParticipant(invites, template)
    if (!signedDoc) {
      const c_study = c_studies.find()
        .skipAcl()
        .grant(accessLevels.read)
        .next()

      const docCreate = {
        ec__study: c_study._id,
        ec__document_template,
        ec__required_signers: invites.length,
        ec__pts: template.ec__pts_only ? template.ec__pts_only : false,
        ec__can_sign_document: !template.ec__delayed_signing
      }
      if (site) {
        docCreate.ec__site = site._id
      }

      signedDoc = ec__signed_documents.insertOne(docCreate)
        .lean(false)
        .skipAcl()
        .grant(accessLevels.update)
        .execute()
    } else {
      ec__signed_documents.updateOne({ _id: signedDoc._id }, { $set: { ec__required_signers: invites.length + signedDoc.ec__required_signers } })
        .skipAcl()
        .grant(accessLevels.update)
        .execute()
    }

    // In case of PTS do not send any invites. ECO-453: Add pin-only user doc visibility fix
    if (template.ec__pts_only) {
      // Set document status to "Partial".
      const updateSet = { ec__status: 'partial' }
      let publicUser = null

      // Find participant invite to set primary participant
      const participantSignerRole = template.ec__signer_roles.find(v => ['participant', 'non-signing participant'].includes(v.ec__signer_type))
      const participantInvite = participantSignerRole && invites.find(v => v.ec__signer_role === participantSignerRole.ec__role)

      if (participantInvite) {
        // Prefer c_public_user _id lookup for PTS
        if (participantInvite.c_public_user) {
          const puCursor = c_public_users.find({ _id: participantInvite.c_public_user })
            .include('c_account') // ECO-453: need c_account for doc access
            .skipAcl()
            .grant(accessLevels.read)
          if (puCursor.hasNext()) {
            publicUser = puCursor.next()
          }
        } else if (participantInvite.ec__email && !EconsentUtilities.isPtsDummyEmail(participantInvite.ec__email)) {
          // Fallback to email lookup for backwards compatibility
          const puCursor = c_public_users.find({ c_email: participantInvite.ec__email })
            .include('c_account') // ECO-453: need c_account for doc access
            .skipAcl()
            .grant(accessLevels.read)
          if (puCursor.hasNext()) {
            publicUser = puCursor.next()
          }
        }

        if (publicUser) {
          // Update primary participant if not already set
          if (!signedDoc.ec__primary_participant || !signedDoc.ec__primary_participant._id.equals(publicUser._id)) {
            updateSet.ec__primary_participant = publicUser._id

            if (!signedDoc.ec__site && publicUser.c_site) {
              updateSet.ec__site = publicUser.c_site._id
            }
          }
        }
      }

      // Update document.
      ec__signed_documents.updateOne({ _id: signedDoc._id }, { $set: updateSet })
        .skipAcl()
        .grant(accessLevels.update)
        .execute()

      // ECO-453: Grant doc access for pin-only users (reuse library function)
      // This adds to ec__accepted_signers AND creates document connection
      if (publicUser && publicUser.c_account) {
        try {
          EconsentLibrary.grantDocumentAccessForParticipant(publicUser._id, publicUser.c_account._id, true)
        } catch (e) {
          logger.error('ECO-453: Failed to grant document access for participant', { participantId: publicUser._id, accountId: publicUser.c_account._id, error: e })
          // Don't fail the invite if this fails - document is still created
        }
      }

      notificationKey = 'c_pts_document_invite'
    }
    EconsentLibrary.createInviteObjects(invites, template, signedDoc)
    const pendingInvites = EconsentLibrary.getNextInvites(signedDoc._id)

    // Create connection for particpant with non signing
    EconsentLibrary.createConnectionForNonSigningParticipant(signedDoc._id, template)

    const returnData = {
      ec__signed_doc: signedDoc._id,
      invites: EconsentLibrary.sendPendingInvites(pendingInvites, template, notificationKey)
    }

    return returnData

  }

  /**
   * @openapi
   * /routes/econsent/resend_invite:
   *   put:
   *     description: 'ec__resend_invite'
   *     parameters:
   *       - name: ec__document_invite
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__email
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *
   *     responses:
   *      '200':
   *        description: 'Resend pending invites'
   *        content:
   *          application/json:
   *            schema:
   *              type: array
   *              items:
   *                type: object
   *                properties:
   *                  "_id":
   *                    type: string
   *                    example: '43434njkjk4343njbh34343ghl'
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'PUT',
    name: 'ec__resend_invite',
    path: 'econsent/resend_invite',
    acl: ['role.administrator', 'role.c_axon_site_user', 'role.c_site_user', 'role.ec__document_manager']
  })
  static resendInvite({ req, body }) {

    const { ec__document_invite, ec__email } = body()

    const inviteCursor = ec__document_invite && ec__document_invites.find({ _id: ec__document_invite })
      .expand('ec__document_template', 'ec__signed_document')
      .skipAcl()
      .grant(accessLevels.read)
    const invite = inviteCursor && inviteCursor.hasNext() && inviteCursor.next()

    if (!invite) {
      faults.throw('econsent.invalidArgument.validInviteIdRequired')
    }

    if (invite.ec__status === 'complete') {
      faults.throw('econsent.invalidArgument.noResendComplete') // don't resend complete emails
    }

    const { ec__signed_document } = invite

    const signedDocEndStates = ['complete', 'voided', 'cancelled']

    if (signedDocEndStates.includes(ec__signed_document.ec__status)) {
      faults.throw('econsent.invalidArgument.noResendEndedDocuments')
    }

    if (!ec__email || invite.ec__email === ec__email) {
      if (invite.ec__status === 'sent') {
        ec__document_invites.updateOne({ _id: invite._id }, { $set: { ec__status: 'pending' } })
          .skipAcl()
          .grant(accessLevels.update)
          .execute()

        const pendingInvites = EconsentLibrary.getNextInvites(invite.ec__signed_document._id)
        return EconsentLibrary.sendPendingInvites(pendingInvites, invite.ec__document_template)
      }
    } else {
      const signerRole = invite.ec__document_template.ec__signer_roles.find(v => v.ec__role === invite.ec__signer_role)
      if (['participant', 'non-signing participant'].includes(signerRole.ec__signer_type)) {
        faults.throw('econsent.invalidArgument.cannotUpdateParticipantSigners')
      }

      if (invite.ec__status === 'pending') {
        ec__document_invites.updateOne({ _id: invite._id }, { $set: { ec__email } })
          .skipAcl()
          .grant(accessLevels.update)
          .execute()
      } else if (invite.ec__status === 'sent') {
        const acceptedSigner = invite.ec__signed_document.ec__accepted_signers.find(v => v.ec__active && v.ec__signer_role === invite.ec__signer_role)

        if (acceptedSigner && acceptedSigner.ec__status === 'partial') {
          faults.throw('econsent.invalidArgument.cannotUpdateSigners') // cannot update email in these status's
        }

        const newInviteData = {
          ec__pin: EconsentUtilities.generateRandomDigitSequence(6),
          ec__email,
          ec__signer_role: invite.ec__signer_role,
          ec__document_template: invite.ec__document_template._id,
          ec__signed_document: invite.ec__signed_document._id,
          ec__order: invite.ec__order
        }

        ec__document_invites.updateOne({ _id: invite._id }, { $set: { ec__valid: false } })
          .skipAcl()
          .grant(accessLevels.update)
          .execute()

        ec__document_invites.insertOne(newInviteData)
          .skipAcl()
          .grant(accessLevels.update)
          .execute()

        const pendingInvites = EconsentLibrary.getNextInvites(invite.ec__signed_document._id)
        return EconsentLibrary.sendPendingInvites(pendingInvites, invite.ec__document_template)
      }
    }

  }

  /**
   * @openapi
   * /routes/econsent/validate_invite/{token}:
   *   get:
   *     description: 'ec__validate_invite'
   *     parameters:
   *       - name: token
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *
   *     responses:
   *      '200':
   *        description: 'Validate invite tokens'
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                ec__requires_registration:
   *                  type: boolean
   *                  example: false
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'GET',
    name: 'ec__validate_invite',
    path: 'econsent/validate_invite/:token',
    acl: ['account.anonymous']
  })
  static validateInvite({ req, body }) {

    const { token } = req.params

    return EconsentLibrary.validateInvite(token)

  }

  /**
   * @openapi
   * /routes/econsent/sign:
   *   post:
   *     description: 'ec__sign_document'
   *     parameters:
   *       - name: ec__signed_document
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: username
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: password
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__signature_identifier
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: signed_initials
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: signed_name
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: signed_date
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *     responses:
   *      '200':
   *        description: Sign document
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              $ref: '#/components/schemas/ec__signed_document'
   *
   *      '400':
   *        description: error message from exception
   *
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    name: 'ec__sign_document',
    path: 'econsent/sign'
  })
  static signDocument({ req, body }) {

    const { ec__signed_document, username, password, ec__signature_identifier, signed_initials, signed_name, signed_date, ssoCode } = body()

    return EconsentLibrary.signDocument(ec__signed_document, password, ec__signature_identifier, signed_initials, signed_name, signed_date, username, ssoCode)
  }

  /**
   * @openapi
   * /routes/econsent/set_data:
   *   post:
   *     description: 'ec__set_document_data'
   *     parameters:
   *       - name: ec__signed_document
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__identifier
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: type
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__value
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *     responses:
   *      '200':
   *        description: Set document data
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              $ref: '#/components/schemas/ec__signed_document'
   *
   *      '400':
   *        description: error message from exception
   *
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    name: 'ec__set_document_data',
    path: 'econsent/set_data'
  })
  static setDocumentData({ req, body }) {

    const { ec__signed_document, ec__identifier, type, ec__value } = body()

    return EconsentLibrary.setDocumentData(ec__signed_document, ec__identifier, type, ec__value)
  }

  /**
   * @openapi
   * /routes/econsent/set_signer_complete:
   *   put:
   *     description: 'ec__set_signer_complete'
   *     parameters:
   *       - name: ec__signed_document
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *
   *     responses:
   *      '200':
   *        description: 'Complete signer'
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              $ref: '#/components/schemas/ec__signed_document'
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'PUT',
    name: 'ec__set_signer_complete',
    path: 'econsent/set_signer_complete'
  })
  static completeSigner({ req, body }) {

    const { ec__signed_document } = body()

    return EconsentLibrary.completeSigner(ec__signed_document)

  }

  /**
   * @openapi
   * /routes/econsent/complete_pts_document:
   *   post:
   *     description: 'ec__complete_pts_document'
   *     parameters:
   *       - name: ec__signed_document
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__completion_time
   *         in: body
   *         required: true
   *         description: Date of the signed document assumed to be wallclock time
   *         schema:
   *           type: string
   *       - name: ec__reason_for_change
   *         in: body
   *         required: true (only when updating the date)
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__pts_signature_date_wallclock
   *         in: body
   *         required: true
   *         description: Date of the PTS signature, in wallclock time
   *         schema:
   *           type: string
   *
   *     responses:
   *      '200':
   *        description: 'Complete pts document'
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              $ref: '#/components/schemas/ec__signed_document'
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    name: 'ec__complete_pts_document',
    path: 'econsent/complete_pts_document',
    acl: ['role.administrator', 'role.c_axon_site_user', 'role.c_site_user', 'role.ec__document_manager']
  })
  static completePtsDocument({ body }) {

    const {
      ec__signed_document,
      ec__completion_time,
      ec__reason_for_change,
      ec__pts_signature_date_wallclock
    } = body()

    return EconsentLibrary.completePtsDocument(ec__signed_document, ec__completion_time, ec__reason_for_change, ec__pts_signature_date_wallclock)

  }

  /**
   * @openapi
   * /routes/econsent/register:
   *   post:
   *     description: 'ec__register_consent_account'
   *     parameters:
   *       - name: email
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: password
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: name
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: mobile
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: token
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *
   *
   *     responses:
   *      '200':
   *        description: 'Register econsent account'
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              $ref: '#/components/schemas/account'
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    name: 'ec__register_consent_account',
    path: 'econsent/register',
    acl: ['account.anonymous']
  })
  static register({ req, body }) {

    const { email, password, name, mobile, token } = body()

    return EconsentLibrary.register(email, password, name, mobile, token)
  }

  /**
   * @openapi
   * /routes/econsent/render_pdf:
   *   post:
   *     description: 'ec__render_pdf'
   *     parameters:
   *       - name: ec__html
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__signed_document
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__document_template
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: ec__site
   *         in: body
   *         required: false
   *         description:
   *         schema:
   *          type: string
   *
   *     responses:
   *      '200':
   *        description: A PDF file
   *        content:
   *          application/pdf:
   *            schema:
   *              type: string
   *              format: binary
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    name: 'ec__render_pdf',
    path: 'econsent/render_pdf'
  })
  static renderPDF({ req, body }) {

    let ec__html = body('ec__html')
    const ec__signed_document = body('ec__signed_document')
    const ec__document_template = body('ec__document_template')
    const ec__site = body('ec__site')

    const { Job } = require('renderer')
    const pdfJob = new Job('ec__econsent')
    const { setHeader } = require('response')

    setHeader('Content-Type', 'application/pdf')

    if (!ec__html && ec__signed_document) {
      const signedDoc = ec__signed_documents.find({ _id: ec__signed_document })
        .expand(
          'ec__document_template',
          'ec__document_template.ec__knowledge_checks',
          'ec__signatures',
          'ec__signature_invites',
          'ec__required_data'
        )
        .skipAcl()
        .grant(accessLevels.read)
        .next()

      signedDoc.ec__required_data.data = ec__document_data.find({ ec__signed_document })
        .skipAcl()
        .grant(accessLevels.read)
        .limit(1000)
        .toArray()

      signedDoc.ec__document_template.ec__assets.forEach(v => {
        const readAsset = ec__document_templates.find({ _id: signedDoc.ec__document_template._id })
          .skipAcl()
          .grant(accessLevels.read)
          .pathRead(v.ec__file.path.split('/')
            .slice(4)
            .join('/'))
        v.ec__file.url = readAsset.url
      })

      ec__html = DocumentProcessor.getDocumentHtml(signedDoc)
    } else if (!ec__html && ec__document_template) {
      // Ckeditor does not prune unused assets, so we need to do it manually
      MismatchHtmlTemplateData.pruneUnusedAssetsIfDraft(ec__document_template)

      const template = ec__document_templates.find({ _id: ec__document_template })
        .expand('ec__knowledge_checks')
        .skipAcl()
        .grant(accessLevels.read)
        .next()

      ec__html = DocumentProcessor.getDocumentHtml({ ec__document_template: template }, { ec__site })
    }

    // Inject PDF-specific CSS to ensure content fits page
    if (config.get('ec__landscape_mode')) {
      const pdfCss = `
        /* PDF Page Size Override - Make page wider to accommodate content */
        @page {
          size: 12in 11in !important;
          margin: 0.5in !important;
        }
      `

      // Inject the CSS right after the opening <style> tag to ensure it takes precedence
      ec__html = ec__html.replace('<style>', `<style>${pdfCss}`)
    }

    return pdfJob
      .addTemplate('html', ec__html)
      .addOutput('consentFile', 'pdf', ['html'])
      .start()
  }

  /**
   * @openapi
   * /routes/econsent/void_document:
   *   post:
   *     description: 'ec__void_document'
   *     parameters:
   *       - name: ec__signed_document
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: reason
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *
   *
   *     responses:
   *      '200':
   *        description: 'Void document'
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              $ref: '#/components/schemas/ec__signed_document'
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    name: 'ec__void_document',
    path: 'econsent/void_document',
    acl: ['role.administrator', 'role.c_axon_site_user', 'role.c_site_user', 'role.ec__document_manager']
  })
  static voidDocument({ req, body }) {

    const { ec__signed_document, reason } = body()

    return EconsentLibrary.voidDocument(ec__signed_document, reason)
  }

  @log({ traceResult: true, traceError: true })
  @trigger('update.before', { object: 'ec__signed_document' })
  static ensureDocumentManagerCanUpdateOnlyPTSDocument() {
    const { ec__pts: isPrintToSign } = ec__signed_documents.find({ _id: script.arguments.old._id })
      .paths('ec__pts')
      .skipAcl()
      .grant(4)
      .next()

    const principalRoles = script.principal.roles.map(role => role.toString())
    const isSiteUser = EconsentUtilities.hasRole(script.principal.roles, 'c_axon_site_user') ||
    EconsentUtilities.isSiteUser() || principalRoles.includes(`${consts.roles.ec__document_manager}`)
    const isAdministrator = principalRoles.includes(`${consts.roles.administrator}`)
    const isUpdatingFinalDoc = script.arguments.modified.includes('ec__final_document')

    if (isUpdatingFinalDoc && !isPrintToSign && isSiteUser && !isAdministrator) {
      faults.throw('econsent.validationError.documentManagerCanOnlyAccessPTSDocuments')
    }

    if (script.arguments.modified.includes('ec__can_sign_document') && script.arguments.old.ec__can_sign_document) {
      faults.throw('econsent.validationError.cannotUpdateCanSignProperty')
    }
  }

  /**
   * @openapi
   * /routes/econsent/clone_template:
   *   post:
   *     description: 'ec__clone_template'
   *     parameters:
   *       - name: ec__document_template
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: newVersion
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *
   *     responses:
   *      '200':
   *        description: 'Clone template'
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              $ref: '#/components/schemas/ec__document_template'
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    name: 'ec__clone_template',
    path: 'econsent/clone_template',
    acl: ['role.administrator', 'role.ec__document_author']
  })
  static cloneTemplate({ req, body }) {
    const { ec__document_template, newVersion } = body()

    if (!ec__document_templates.find({ _id: ec__document_template })
      .skipAcl()
      .grant(accessLevels.read)
      .hasNext()) {
      faults.throw('econsent.invalidArgument.validTemplateId') // you must provide a valid tempalte ID to clone
    }

    const clonedTemplate = TemplateCloner.getTemplateClone(ec__document_template, newVersion)

    // Ckeditor does not prune unused assets, so we need to do it manually
    if (clonedTemplate && clonedTemplate._id) {
      MismatchHtmlTemplateData.pruneUnusedAssetsIfDraft(clonedTemplate._id, true)
    }

    return clonedTemplate
  }

  // Triggers

  // triggers to guarantee consistency of properties between c_study and public user
  @trigger('create.before', { object: 'c_study', weight: 1 })
  static studyBeforeCreate() {

    if (_.isEmpty(script.arguments.new.c_supported_locales)) {
      script.arguments.new.update({
        c_supported_locales: [org.objects.org.find()
          .next().locale]
      }, { grant: accessLevels.delete })
    }

  }

  @trigger('create.before', { object: 'ec__signed_document', weight: 1 })
  static signedBeforeCreate() {
    script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: 'update' } }, () => {

      const update = {
        ec__identifier: EconsentUtilities.getNextSignedDocID()
      }

      const template = ec__document_templates.find({ _id: script.arguments.new.ec__document_template._id })
        .paths('ec__custom_data')
        .next()

      if (template.ec__custom_data) {
        update.ec__custom_data = template.ec__custom_data.map(v => _.pick(v, 'ec__label', 'ec__type', 'ec__value'))
      }

      _.isEmpty(script.arguments.new.ec__identifier) && script.arguments.new.update(update, { skipAcl: true, grant: accessLevels.delete })
    })
  }

  @trigger('create.after', { object: 'account', weight: 1 })
  static accountAfterCreate() {
    const { email, _id } = script.arguments.new

    // this is a coverall. Create the document connections if they don't exist
    script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: 'update' } }, () => {
      ec__document_invites.find({ ec__email: email })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .expand('ec__document_template')
        .forEach(inv => {

          EconsentLibrary.updateAcceptedSigners(_id, inv.ec__signed_document._id, inv.ec__signer_role)

          const options = {
            where: {
              'context._id': inv.ec__signed_document._id,
              'target.account._id': _id
            },
            skipAcl: true
          }

          const cons = connections.list(options)

          if (cons && cons.data && cons.data.length === 0) {
            EconsentLibrary.createDocumentConnection(_id, inv.ec__signed_document._id)
          }
        })
    })

  }

  @trigger('create.before', { object: 'account', weight: 1 })
  static accountBeforeCreate() {
    const { email, roles } = script.arguments.new
    const updatedRoles = roles.map(v => v.toString())

    script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: 'update' } }, () => {
      ec__document_invites.find({ ec__email: email })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .expand('ec__document_template')
        .forEach(inv => {
          if (!updatedRoles.includes(consts.roles.c_study_participant)) {
            const signerRole = inv.ec__document_template.ec__signer_roles.find(v => v.c_role === inv.c_signer_role)
            if (signerRole.ec__signer_type === 'participant') {
              updatedRoles.push(consts.roles.c_study_participant)
            }
          }
        })
      if (updatedRoles.length !== roles.length) {
        script.arguments.new.update({ roles: updatedRoles }, { grant: accessLevels.delete })
      }
    })

  }

  @log({ traceResult: true, traceError: true })
  @trigger('create.after', 'update.after', { object: 'ec__document_invite', weight: 1 })
  static inviteChanges() {
    script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: 'update' } }, () => {

      const { _id, ec__email } = script.arguments.old || script.arguments.new

      // Skip email-based lookup for PTS dummy emails - primary participant is set directly in inviteConsent
      if (EconsentUtilities.isPtsDummyEmail(ec__email)) {
        return
      }

      const puCursor = c_public_users.find({ c_email: ec__email })

      if (puCursor.hasNext()) {
        const publicUser = puCursor.next()

        const invite = ec__document_invites.find({ _id })
          .paths('ec__email', 'ec__signer_role', 'ec__document_template.ec__signer_roles', 'ec__signed_document.ec__primary_participant', 'ec__signed_document.ec__site')
          .next()

        const role = invite.ec__document_template.ec__signer_roles.find(v => v.ec__role === invite.ec__signer_role)

        if (['participant', 'non-signing participant'].includes(role.ec__signer_type)) {
          if (!invite.ec__signed_document.ec__primary_participant || !invite.ec__signed_document.ec__primary_participant._id.equals(publicUser._id)) {
            const update = { ec__primary_participant: publicUser._id }

            if (!invite.ec__signed_document.ec__site && publicUser.c_site) {
              update.ec__site = publicUser.c_site._id
            }

            ec__signed_documents.updateOne({ _id: invite.ec__signed_document._id }, { $set: update })
              .execute()
          }

        }
      }

    })
  }

  @log({ traceResult: true, traceError: true })
  @trigger('update.after', {
    object: 'ec__signed_document',
    weight: 1,
    if: {
      $and: [
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'ec__final_document'
            ]
          }, 0]
        },
        {
          $eq: [
            {
              $pathTo: ['$$ROOT', 'ec__pts']
            },
            true
          ]
        },
        {
          $eq: [
            {
              $pathTo: ['$$ROOT', 'ec__pts_document_uploaded']
            },
            false
          ]
        }
      ]
    }
  })
  static ptsDocumentUploaded() {
    ec__signed_documents.updateOne({ _id: script.arguments.old._id }, { $set: { ec__pts_document_uploaded: true } })
      .skipAcl()
      .grant(accessLevels.update)
      .execute()
  }

  /**
   * @openapi
   * /routes/econsent/get_signer_app_link/{inviteId}:
   *   get:
   *     description: 'ec__app_configuration'
   *     parameters:
   *       - name: ec__document_template
   *         in: path
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *
   *     responses:
   *      '200':
   *        description: 'Get app configuration'
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              example: '{"signerAppLink":"https://app.medable.com/invite/token"}'
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'GET',
    name: 'ec__app_configuration',
    path: 'econsent/get_signer_app_link/:inviteId',
    acl: ['role.administrator', 'role.c_axon_site_user', 'role.c_site_user', 'role.ec__document_manager']
  })
  static getSignerAppLink({ req: { params: { inviteId } } }) {
    return EconsentLibrary.getSignerAppLink(inviteId)
  }

  /**
   * @openapi
   * /routes/accounts/{account}/sites/assign:
   *   post:
   *     description: 'ec__assign_site'
   *     parameters:
   *       - name: account
   *         in: path
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: site_ids
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: array
   *           items:
   *            type: string
   *            example: '43434njkjk4343njbh34343ghl'
   *
   *     responses:
   *      '200':
   *        description: 'Assign site to user'
   *        content:
   *          application/json:
   *            schema:
   *              type: boolean
   *              example: false
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    name: 'ec__assign_site',
    path: 'accounts/:account/sites/assign',
    acl: ['role.administrator', 'role.support', 'role.c_study_designer']
  })
  static assignSites({ req: { params: { account } }, body }) {
    return EconsentLibrary.assignSites(account, toArray(body()))
  }

  /**
   * @openapi
   * /routes/accounts/{account}/sites/unassign:
   *   post:
   *     description: 'ec__unassign_site'
   *     parameters:
   *       - name: account
   *         in: path
   *         required: true
   *         description:
   *         schema:
   *           type: string
   *       - name: site_ids
   *         in: body
   *         required: true
   *         description:
   *         schema:
   *           type: array
   *           items:
   *            type: string
   *            example: '43434njkjk4343njbh34343ghl'
   *
   *     responses:
   *      '200':
   *        description: 'Un-assign site to user'
   *        content:
   *          application/json:
   *            schema:
   *              type: boolean
   *              example: false
   *      '400':
   *        description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    name: 'ec__unassign_site',
    path: 'accounts/:account/sites/unassign',
    acl: ['role.administrator', 'role.support', 'role.c_study_designer']
  })
  static unassignSites({ req: { params: { account } }, body }) {
    return EconsentLibrary.unassignSites(account, toArray(body()))
  }

  /**
   * @openapi
   * /routes/ec_site_signers/{siteId}:
   *  get:
   *   description: '_ec_site_signers'
   *  parameters:
   *  - name: siteId
   *   in: path
   *  required: true
   * description:
   * schema:
   * type: string
   * example: '43434njkjk4343njbh34343ghl'
   * responses:
   * '200':
   * description: 'Returns a list of ec__site_signers'
   * content:
   * application/json:
   * schema:
   * type: array
   * items:
   * type: object
   * $ref: '#/components/schemas/account'
   * '400':
   * description: error message from exception
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'GET',
    name: 'get_ec_site_signers',
    path: 'ec__site_signers/:siteId',
    acl: ['role.administrator', 'role.c_axon_site_user', 'role.c_site_user', 'role.ec__document_manager']
  })
  static getECSiteSigners({ req: { params: { siteId } } }) {
    return EconsentLibrary.getECSiteSigners(siteId)
  }

  @trigger('update.after', { object: 'c_public_user', weight: 1, inline: true })
  static participantAfterUpdate() {
    const oldEmail = script.arguments.old.c_email
    const newEmail = script.arguments.new.c_email
    const oldStatus = script.arguments.old.c_status
    const newStatus = script.arguments.new.c_status

    if (newEmail && oldEmail && newEmail !== oldEmail) {
      EconsentLibrary.processDocumentInvitesForNewEmail(script.arguments.old._id, oldEmail, newEmail)
    }

    if (newStatus && newStatus.toLowerCase() === 'deactivated' && newStatus !== oldStatus) {
      EconsentLibrary.voidUncompletedDocuments(script.arguments.old._id, 'Participant Deactivated')
    }

    // ECO-453: Grant doc access when c_account linked (pin-only or email user registration)
    const newAcc = script.arguments.new.c_account
    const oldAcc = script.arguments.old.c_account
    if (newAcc && !oldAcc) {
      try {
        EconsentLibrary.grantDocumentAccessForParticipant(script.arguments.new._id, newAcc._id || newAcc, true)
      } catch (e) {
        logger.error(e)
      }
    }
  }

  /**
   * Check if user has logged into the app using SSO
   * @path {GET} /econsent/users/check-sso
   */
  @route({
    weight: 1,
    method: 'GET',
    name: 'ec_check_sso',
    path: 'econsent/users/check-sso',
    acl: [
      'account.anonymous'
    ]
  })
  static checkIfSsoUser() {
    return SsoLibrary.checkIfSsoUser()
  }

  /**
   * Redirect to cortex api GET /sso/oidc/login with callback to GET /econsent/sso/generate-code
   * @path {GET} /econsent/sso/login
   */
  @route({
    weight: 1,
    method: 'GET',
    name: 'ec_sso_login',
    apiKey: 'c_site_app_demo',
    path: 'econsent/sso/login',
    acl: [
      'account.anonymous'
    ]
  })
  static initSsoCodeCreation({ req, res }) {
    const url = SsoLibrary.buildSsoCodeCallbackUrl(req.host, req.query.return_to)
    res.redirect(url)
  }

  /**
   * Redirect to return_to url provided to GET /econsent/sso/login with generated code that was added to query parameters
   * @path {GET} /econsent/sso/generate-code
   */
  @route({
    weight: 1,
    method: 'GET',
    name: 'ec_sso_generate_code',
    apiKey: 'c_site_app_demo',
    path: 'econsent/sso/generate-code',
    acl: [
      'account.anonymous'
    ]
  })
  static createSsoCode({ req, res }) {
    const url = SsoLibrary.generateSsoCodeAndPrepareReturnUrl(req.query.return_to, {
      error: req.query.error,
      error_description: req.query.error_description
    })
    res.redirect(url)
  }

}

module.exports = EconsentRoutes