import nucUtils from 'c_nucleus_utils'
const { accessLevels: { read } } = consts
const { c_public_user: PublicUser, c_sites: Sites, accounts: Accounts } = org.objects

const { AclManagment: { canSetPublicUserReviewStatus }, canApprovePublicUser } = require('c_nucleus_utils')
const { route, trigger } = require('decorators')
const faults = require('c_fault_lib')
const cache = require('cache')
const util = require('util')
const { debug } = require('logger')
const audit = require('audit')

class SubjectCasebookSignature {

  publicUserId
  publicUserCursor
  force

  constructor(publicUserId, force) {
    this.force = !!force
    this.publicUserId = publicUserId
    this.publicUserCursor = PublicUser
      .find({ _id: publicUserId })
      .skipAcl()
      .grant(read)
  }

  sign() {

    const publicUser = this.publicUserCursor.next()

    const site = publicUser.c_site

    if (!site) {
      faults.throw('axon.invalidArgument.validSiteRequired')
    }

    const { name } = script.principal

    const signature = {
      signer: `${name.first} ${name.last}`,
      date: new Date()
        .toISOString(),
      value: {
        signed: true
      }
    }

    const updateOp = {
      $set: {
        c_review_status: 'Approved'
      },
      $push: {
        c_signatures: [signature]
      }
    }

    // cache doesn't support props starting with $ so can't send updateOpt as is (notice $set and $push)
    // we store in cache because we need to retrieve this information in triggers
    this.storeInCache({
      force: this.force,
      c_review_status: updateOp.$set.c_review_status,
      c_signatures: updateOp.$push.c_signatures
    })

    const availableRoleIds = nucUtils.getUserRolesSimple(script.principal._id, site._id)
    if (nucUtils.isNewSiteUser(availableRoleIds)) {
      return Accounts
        .updateOne({ _id: script.principal._id }, updateOp)
        .pathPrefix(`c_sites/${site._id}/c_subjects/${this.publicUserId}`)
        .lean(false)
        .execute()
    } else {
      return Sites
        .updateOne({ _id: site._id }, updateOp)
        .pathPrefix(`c_subjects/${this.publicUserId}`)
        .lean(false)
        .execute()
    }

  }

  storeInCache(cacheValue) {

    const cacheIdentifier = `casebook-signature-on-${this.publicUserId}`

    cache.set(cacheIdentifier, cacheValue, 15)

    // make sure we delete cache when we finish route execution
    script.on('exit', () => {
      cache.clear(cacheIdentifier)
    })
  }

  static getFromCache(publicUserId) {

    const cacheIdentifier = `casebook-signature-on-${publicUserId}`

    const cacheResult = cache.get(cacheIdentifier)

    return cacheResult || {}
  }

  static canSign(body, publicUserId) {

    // will check if the user running the request can apply  the review status
    // only check if the context is public user edition
    if (script.context.object === 'c_public_user') {

      if (!canSetPublicUserReviewStatus()) {
        throw Fault.create('kAccessDenied')
      }
    }

    const { force, c_signatures, c_review_status } = SubjectCasebookSignature.getFromCache(publicUserId)

    const reviewStatus = c_review_status || (body && body.c_review_status)

    if (reviewStatus !== 'Approved') {
      // TODO: Update exception code with something more meaningful?????
      throw Fault.create('kAccessDenied')
    }

    // checks if there are unapproved tasks
    if (!canApprovePublicUser(publicUserId)) {

      if (!force) {
        faults.throw('axon.invalidArgument.unapprovedTasksRemain')
      }
    }

    const signatures = c_signatures || (body && body.c_signatures)

    if (!signatures || signatures.length === 0) {
      faults.throw('axon.invalidArgument.signatureRequiredToApprove')
    }

    return true
  }

}

class SignSubjectCasebookService {

  /**
   * @openapi
   * /c_public_user/{id}/sign:
   *  post:
   *    description:  "Sign subject casebook"
   *    parameters:
   *      - name: id
   *        in: path
   *        required: true
   *        description: User ID
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              c_tz:
   *                type: string
   *              c_locale:
   *                type: string
   *
   *    responses:
   *      '200':
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                force:
   *                  type: boolean
   *                password:
   *                  type: string
   */
  @route({
    method: 'POST',
    name: 'c_sign_subject_casebook',
    path: 'c_public_user/:id/sign'
  })
  static signSubjectCasebook({ req, body }) {

    const { params: { id } } = req

    if (id && !util.id.isIdFormat(id)) {
      faults.throw('axon.invalidArgument.invalidObjectId')
    }

    const publicUserExists = PublicUser.find({ _id: id })
      .skipAcl()
      .grant(read)
      .hasNext()

    if (!publicUserExists) {
      faults.throw('axon.notFound.instanceNotFound')
    }

    const { force = false, password = '' } = body()

    // will throw exception if credentials are wrong
    Accounts.attemptAuth(script.principal.email, password)

    const subjectCasebookSignature = new SubjectCasebookSignature(id, force)

    return subjectCasebookSignature.sign()
  }

  @trigger('update.before', {
    object: 'c_public_user',
    weight: 1,
    if: {
      $and: [
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'c_review_status'
            ]
          }, 0]
        },
        {
          $eq: ['$$ROOT.c_review_status', 'Approved']
        }
      ]
    }
  })
  static beforeUpdatePublicUser({ body }) {

    const { arguments: { new: newStatus, old: oldStatus } } = script

    const isNewStatus = newStatus.c_review_status !== oldStatus.c_review_status

    if (!isNewStatus) return

    if (SubjectCasebookSignature.canSign(body(), newStatus._id)) {
      audit.record('c_public_user', newStatus._id, 'update', { metadata: { message: 'Subject Casebook Signed', signerId: script.principal._id } })
    }

    return true
  }

  // This assumes that signatures is only used in public user object, if we later on we need to add signatures to other object this needs to be modified
  @trigger('create.before', { object: 'signature', weight: 1 })
  static beforeCreateSignature({ body }) {

    const { arguments: { new: newSignature } } = script

    if (newSignature.context.object !== 'c_public_user') return

    // newSignature.context._id has the publicUserId
    return SubjectCasebookSignature.canSign(body(), newSignature.context._id)
  }

}

module.exports = {
  SignSubjectCasebookService
}