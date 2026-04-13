import { route, log } from 'decorators'
import moment from 'moment'
import logger from 'logger'
import _ from 'underscore'
import faults from 'c_fault_lib'
import { TaskResponse, Review } from 'c_dmweb_lib'
import AddReviews from 'c_axon_add_review_types'

const {
  accounts,
  c_studies,
  c_task_responses
} = org.objects

class SignReviewType {

  static getAndValidateAccount(password, username) {
    const identifier = username
    try {
      if (script.principal.email !== identifier) {
        faults.throw('axon.invalidArgument.usernameAndAccessCodeRequired')
      }
      accounts.attemptAuth(identifier, password)
    } catch (err) {
      faults.throw('axon.invalidArgument.inCorrectEmailandPassword')
    }
    return accounts.find({ $or: [{ email: identifier }, { username: identifier }] })
      .skipAcl()
      .grant(4)
      .next()
  }

  /**
   * @openapi
   * /routes/sign/reviews/c_task_response/{taskResponseId}:
   *  put:
   *    description: 'api to sign review'
   *    parameters:
   *      - name: taskResponseId
   *        in: path
   *        required: true
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              username:
   *                type: string
   *              password:
   *                type: string
   *              signed_name:
   *                type: string
   *              signed_date:
   *                type: string
   *              signature_identifier:
   *                type: string
   *              signer_role:
   *                type: array
   *              signer_id:
   *                type: string
   *              dryRun:
   *                type: boolean
   *    responses:
   *      '200':
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                object:
   *                  type: string
   *                data:
   *                  type: string
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'PUT',
    name: 'c_sign_reviews_task_response',
    path: 'sign/reviews/c_task_response/:taskResponseId'
  })
  static signReviewType({ req, body }) {
    const { taskResponseId } = req.params
    let { username, password, signed_name, signed_date, signature_identifier, signer_role, signer_id, dryRun } = body()
    const account = this.getAndValidateAccount(password, username)
    dryRun = dryRun || false
    signer_role = signer_role || script.principal.roles
    signer_id = signer_id || `${account._id}`
    signed_name = signed_name || `${account.name.first} ${account.name.last}`
    signed_date = signed_date || moment()
      .toISOString()

    // check associated review type in task
    const requiredReviewIds = TaskResponse.getGroupTaskRequiredReviews(taskResponseId)
    if (requiredReviewIds.length === 0) {
      faults.throw('axon.error.noReviewtypeIsAssociatedwithThisTask')
    }
    // check if task response already signed
    const signature = {
      signer: signed_name,
      date: signed_date,
      value: {
        signature_identifier: signature_identifier || '',
        signed: true,
        signer_role: signer_role,
        signer_id: signer_id
      }
    }

    return AddReviews.executeAddReviews(taskResponseId, dryRun, true, signature)
  }

}

module.exports = SignReviewType