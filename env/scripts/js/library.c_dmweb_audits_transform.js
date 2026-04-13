/* eslint-disable no-prototype-builtins */
import { paths, id } from 'util'
import _ from 'underscore'
import nucPermissions from 'c_nucleus_permissions'
import { patchHistoryOperations } from 'c_axon_combatibility_library'
import { debug } from 'logger'
import nucUtils from 'c_nucleus_utils'
import i18n from 'i18n'
const { transform } = require('decorators-transform')
const { params: { objectId } } = require('request')
const equalIds = id.equalIds

@transform
class AuditsTransform {

  SystemUser = nucPermissions.SystemUser.name
  stepFields = ['c_type', 'c_text', 'c_question', 'c_description', 'c_name']

  beforeAll(memo) {
    memo.skippedStepResponses = []
    memo.pristineAudits = []

    memo.study = org.objects
      .c_study
      .find()
      .expand('c_patient_flags')
      .paths('c_patient_flags')
      .skipAcl()
      .grant('read')
      .next()
  }

  afterAll(memo) {

    if (script.env.name === 'development') {
      debug('Pristine Audits', memo.pristineAudits)
    }
  }

  each(object, memo) {

    if (script.env.name === 'development') {
      memo.pristineAudits.push(JSON.parse(JSON.stringify(object)))
    }

    patchHistoryOperations(object)

    this.rectifyHistory(object)

    // ignoring
    if (this.isDoubleSkipFalse(object)) {
      return
    }

    const isMemoed = this.memoIfSkippedStepResponse(memo, object)

    if (isMemoed) {

      // if we have memoed a Step Response it means that  it was skipped, we need to save for later
      return
    }

    this.addPublicIdentifier(object)

    // handle logic is to handle step responses in general, for specifics in image capture see below
    this.enhanceStepResponse(memo, object)

    // this special treatment is because File Step Response Types are generating one history per file status and we don't need all of them
    if (paths.to(object, 'document.type') === 'c_image_capture') {

      return this.filterImageCapture(object, memo)
    }

    this.enhanceQuery(object)

    this.enhanceReview(object)

    this.enhancePublicUser(object, memo)
    return object
  }

  // this function modifies history removing / merging unnecessary properties and values
  rectifyHistory(object) {

    object.ops = object.ops
      .filter(operation => {
        const necessaryFields = operation.hasOwnProperty('path') &&
          operation.hasOwnProperty('value')

        return necessaryFields
      })

    return object
  }

  // strange case where skip false is set regardless of being false already
  isDoubleSkipFalse(object) {

    // for some reason not all double skip are invalid, only c_image_capture double skip may  be?
    if (object.document.type === 'c_image_capture') {
      const [firstOp] = object.ops
      const isSkippedFalseOp = firstOp && object.ops.length === 1 && firstOp.path === 'c_skipped' && firstOp.value === false
      const isSkippedFalseDocument = object.document.hasOwnProperty('c_skipped') && object.document.c_skipped === false

      return isSkippedFalseOp && isSkippedFalseDocument
    }

    return false
  }

  // make special treatment to image captures
  filterImageCapture(object) {

    // check if this is a skipped history
    const isOpSkipped = object.ops.find(op => op.value === 'skipped')

    const isDocSkipped = object.document.c_value === 'skipped'

    // nothing else to do
    if (isOpSkipped || isDocSkipped) {

      return object
    }

    // filter out objects that have the file state different than 2
    // as a history you probably want only files that are ready to be displayed
    const opsNumber = object.ops.length

    const [firstOpFilename, secondOpFilename] =
      object.ops
        .map(o => o.value ? o.value.filename : undefined)

    const documentFilename = paths.to(object, 'document.c_value.filename')

    const documentFileState = paths.to(object, 'document.c_value.state')

    const isFileUpdate = opsNumber === 2 &&
      firstOpFilename &&
      firstOpFilename !== documentFilename &&
      secondOpFilename === documentFilename

    const isFileCreation = opsNumber === 1 &&
      firstOpFilename === documentFilename &&
        secondOpFilename === undefined &&
          // this is just to filter the extra history when the image changes to status 2 , here the choice
          // is to show a history that doesn't add any value to the end-user or show a history that confirms tha change of the state
          // that would only be useful for debugging purposes
          documentFileState !== 2

    if (isFileCreation || isFileUpdate) {

      return object
    } else {

      return undefined
    }

  }

  memoIfSkippedStepResponse(memo, object) {

    if (paths.to(object, 'context.object') === 'c_step_response') {

      if (object.ops.length === 1) {

        const [firstOp] = object.ops

        const endSkipValue = object.document.c_skipped

        const opSkipValue = firstOp.value

        if (firstOp.path === 'c_skipped' && opSkipValue !== endSkipValue) {

          const isAlreadyMemoed = memo.skippedStepResponses.find(skippedSr => id.equalIds(skippedSr.context._id, object.context._id))

          if (!isAlreadyMemoed) {

            memo.skippedStepResponses.push(object)

            return true
          }
        }

        // strange case without op, probably a consequence of patchHistoryOperations
      } else if (object.ops.length === 0 && object.document.c_skipped && !object.document.c_value) {

        const endSkipValue = object.document.c_skipped

        if (endSkipValue) {

          const isAlreadyMemoed = memo.skippedStepResponses.find(skippedSr => id.equalIds(skippedSr.context._id, object.context._id))

          if (!isAlreadyMemoed) {

            memo.skippedStepResponses.push(object)

            return true
          }
        }
      }
    }

    return false
  }

  addPublicIdentifier(object) {

    if (paths.to(object, 'document.updater._id')) {

      const [account] = org.objects.accounts
        .find({ _id: object.document.updater._id })
        .paths('c_public_identifier', 'roles', 'email')
        .skipAcl()
        .grant(consts.accessLevels.read)
        .toArray()

      if (account && account.roles && account.roles.some(r => equalIds(r, consts.roles.c_study_participant))) {
        let identifier
        const publicUser = org.objects.c_public_user.find({ c_account: account._id })
          .skipAcl()
          .grant('read')
          .next()
        if (!publicUser.c_number) {
          const object = org.objects.objects.readOne({ name: 'c_public_user' }) // get the localized value for Participant if c_number is not available
            .execute()
          identifier = object.label
        } else {
          identifier = publicUser.c_number
        }
        _.extend(object.document.updater, { c_public_identifier: identifier })
      } else if (paths.to(account, 'c_public_identifier')) {

        _.extend(object.document.updater, { c_public_identifier: account.c_public_identifier })
      } else {

        const serviceAcc = this.scriptAsAdmin(() => {
          const { serviceAccounts } = org.objects.org.find()
            .next()

          return serviceAccounts.find(v => id.equalIds(v._id, object.document.updater._id))
        })

        if (serviceAcc) {

          _.extend(object.document.updater, { c_public_identifier: serviceAcc.label })
        }
      }
    }
  }

  enhanceStepResponse(memo, object) {

    if (paths.to(object, 'context.object') === 'c_step_response') {

      const [stepResponse] = this.scriptAsAdmin(() => org.objects.c_step_response.aggregate([
        { $match: { _id: object.context._id } },
        {
          $project: {
            c_step: {
              $expand: this.stepFields
            }
          }
        }])
        .toArray())

      // add step information to history object
      if (paths.to(stepResponse, 'c_step._id')) {
        _.extend(object.document, { c_step: stepResponse.c_step })
      }

      if (object.ops.length === 1) {

        const [firstOp] = object.ops

        let previousValue = firstOp.value

        if (_.isArray(object.document.c_value) && object.document.c_value.length === 1) {
          // wrap it in array to match document, this is to compensate how cortex returns ops
          previousValue = [firstOp.value]
        }

        const opValue = this.expander({ [firstOp.path]: previousValue })

        const documentValue = { c_value: object.document.c_value }

        const wasSkipped = memo.skippedStepResponses.find(skippedSr => id.equalIds(skippedSr.context._id, object.context._id))

        const isValueEqual = (opValue, documentValue) => {

          if (object.document.type === 'c_image_capture') {
            // this is the case of image capture, value is an object
            // we are going to compare 3 properties to know if files are equal

            if (!opValue.c_value || !documentValue.c_value) return false

            const sameFileName = opValue.c_value.filename === documentValue.c_value.filename
            const sameSize = opValue.c_value.size === documentValue.c_value.size
            const sameETag = opValue.c_value.ETag === documentValue.c_value.ETag

            return sameFileName && sameSize && sameETag
          }

          return _.isEqual(opValue, documentValue)
        }

        // if both values are equal and it was previously skipped then it means that this entry is with previous value skipped
        if (isValueEqual(opValue, documentValue) && !!wasSkipped) {

          // this is from skipped to new value
          if (wasSkipped.document.c_skipped === false) {

            firstOp.value = 'skipped'
            object.ops = [firstOp]

          } else {
            // this case is from value to skipped
            object.document.c_value = 'skipped'
            object.document.c_skipped = true
          }

          // copy the reason for skipping
          object.message = wasSkipped.message
          object.document.message = wasSkipped.message

          const skippedSrIds = memo.skippedStepResponses.map(({ context }) => context._id)

          const indexOfStepResponse = id.indexOfId(skippedSrIds, object.context._id)

          // remove it because we have dealt with the skipped response, this can only happen once after it was skipped
          memo.skippedStepResponses.splice(indexOfStepResponse, 1)

        // this case is when the first time the user completes a step response, that response is skipped
        } else if (!isValueEqual(opValue, documentValue) && firstOp.path === 'c_skipped') {

          object.document.c_value = 'skipped'
          object.document.c_skipped = true

        }

      } else if (object.ops.length > 1) {

        const indexOfSkipOp = object.ops.findIndex(o => o.path === 'c_skipped')

        if (indexOfSkipOp >= 0) {

          const countOfSkipFalse = object.ops.reduce((acc, op) => acc + (op.path === 'c_skipped' && op.value === false), 0)

          if (countOfSkipFalse >= 2) {
            const falseySkipIdx = object.ops.findIndex(o => o.path === 'c_skipped' && o.value === false)

            // remove repeated falsey skip
            object.ops.splice(falseySkipIdx, 1)
          }

          let opSkipValue = object.ops[indexOfSkipOp].value

          const endSkipValue = object.document.c_skipped

          // remove extra  ops where skip is the same in ops and document, they are irrelevant
          if (opSkipValue === endSkipValue) {

            object.ops.splice(indexOfSkipOp, 1)

            if (object.ops[0].path === 'c_skipped') {
              opSkipValue = object.ops[0].value
            }

          }

          const previousValueOp = object.ops.find(o => !_.isNull(o.value))

          let otherOps = object.ops.filter(o => o.path !== 'c_skipped' && o.path !== 'c_value')
          // To handle cases where ops has more than one c_value
          if (otherOps.length === 0) {
            otherOps = object.ops.filter(o => o.path !== 'c_skipped' && o._id !== previousValueOp._id)
          }

          if (opSkipValue && !endSkipValue) {
            // this case is when we first skipped and then decided to upload a response

            previousValueOp.value = 'skipped'

          } else if (!opSkipValue && endSkipValue) {

            object.document.c_value = 'skipped'

            if (object.ops.length === 1) {
              previousValueOp.path = 'c_value'

              previousValueOp.value = 'skipped'
            } else if (object.ops.length > 1) {
              // remove unnecessary ops

              object.ops = object.ops.filter(op => op.path !== 'c_skipped')

              return
            }

          }

          // it is not clear when otherOps will have something meaningful
          object.ops = [previousValueOp, ...otherOps]

        }
      }
    }
  }

  // expander creates an object based on a path:
  // if you provide expander({ 'a.b': 1 }) it will create { a: { b: 1 } }
  expander(obj, base) {
    return Object.keys(obj)
      .reduce((clone, key) => {
        // eslint-disable-next-line no-return-assign
        key.split('.')
          // eslint-disable-next-line no-return-assign
          .reduce((innerObj, innerKey, i, arr) =>
            innerObj[innerKey] = (i + 1 === arr.length) ? obj[key] : innerObj[innerKey] || {}, clone)
        return clone
      }, Object.assign({}, base))
  }

  enhanceQuery(object) {
    if (paths.to(object, 'context.object') === 'c_query') {

      const [query] = this.scriptAsAdmin(() => org.objects.c_query.aggregate([
        { $match: { _id: object.context._id } },
        {
          $project: {
            c_response: 1,
            c_description: 1,
            c_number: 1,
            c_step_response: {
              $expand: {
                c_step: {
                  $expand: this.stepFields
                }
              }
            },
            c_responded_by: {
              $expand: {
                c_public_identifier: 1
              }
            },
            c_responded_datetime: 1,
            created: 1,
            c_closing_reason: 1,
            c_closed_datetime: 1,
            c_closed_by: {
              $expand: {
                c_public_identifier: 1
              }
            },
            creator: {
              $expand: {
                c_public_identifier: 1
              }
            }
          }
        }
      ])
        .toArray())
      _.extend(object.document, query)
      if (paths.to(query, 'c_step_response.c_step._id')) {
        _.extend(object.document, { c_step: query.c_step_response.c_step })
      }
    }
  }

  enhanceReview(object) {
    if (paths.to(object, 'context.object') === 'c_review' && objectId) {
      const [taskResponse] = this.scriptAsAdmin(() => org.objects.c_task_response.aggregate([
        { $match: { _id: objectId } },
        {
          $project: {
            c_reviews: {
              $expand: {
                limit: 1000,
                pipeline: [
                  { $project: { c_review_type: 1, c_date: 1, c_invalidated_at: 1 } }
                ]
              }
            },
            c_study: {
              $expand: ['c_review_types']
            },
            c_task: 1,
            c_signatures: 1
          }
        }
      ])
        .toArray())
      const appliedReviewId = object.context._id
      const getNewReviewType = org.objects.c_review_type
        .find({ c_task_list: { $in: [taskResponse.c_task._id.toString()] } })
        .paths('_id', 'c_roles', 'c_active', 'c_key', 'c_name', 'c_required_signature')
        .skipAcl()
        .grant(consts.accessLevels.read)
        .toArray()
      const allReviewType = [...taskResponse.c_study.c_review_types, ...getNewReviewType]
      const appliedReview = id.findIdInArray(taskResponse.c_reviews.data, '_id', appliedReviewId)
      const reviewType = id.findIdInArray(allReviewType, '_id', appliedReview.c_review_type)
      if (reviewType) {
        _.extend(object.document, { c_review_type: reviewType })
        if (taskResponse.c_signatures && taskResponse.c_signatures.data.length > 0) {
          _.extend(object.document, { c_signatures: taskResponse.c_signatures.data })
        }
      }
    }
  }

  enhancePublicUser(object, memo) {
    if (paths.to(object, 'context.object') === 'c_public_user') {

      object.ops = object.ops.filter(o => o.path !== 'c_invite')

      if (object.document.c_status === 'Deactivated') {
        const { locale } = org.objects.accounts.find({ _id: script.principal._id })
          .next()

        const deactivationReason = i18n.translate(`siteapp-app:deactivationReasonCodes.${object.message}`, { locale }) || object.message

        object.message = deactivationReason
        object.document.message = deactivationReason
      }
      if (object.document.c_set_patient_flags) {

        const { study } = memo

        if (!study || !study.c_patient_flags) return

        const { c_patient_flags: { data: patientFlags } } = study

        if (patientFlags.length === 0) return patientFlags

        const [publicUser] = this.scriptAsAdmin(() => org
          .objects
          .c_public_users
          .find({ _id: objectId })
          .paths('c_set_patient_flags')
          .skipAcl()
          .grant('read')
          .toArray())

        if (!publicUser) return

        const puSetFlags = publicUser.c_set_patient_flags

        object.document.c_set_patient_flags = object
          .document
          .c_set_patient_flags
          .map(({ _id, c_enabled }) => {

            const matchingSetFlag = puSetFlags.find((flag) => flag._id.equals(_id))

            if (!matchingSetFlag) return { _id, c_enabled }

            const matchingFlag = patientFlags.find((flag) => flag.c_identifier === matchingSetFlag.c_identifier)

            return {
              _id,
              c_enabled,
              c_identifier: matchingFlag.c_identifier,
              c_label: matchingFlag.c_label
            }
          })
      }
      if (object.document.c_set_dates) {

        // TODO: This is incomplete and wrong, we just want to support the case of
        // anchor date creation on public user
        // The client does not support UPDATE of anchor dates and it only supports the value of the anchor date in the
        // ops array which is also wrong, leaving this workaround for now

        const setDateId = paths.to(object, 'document.c_set_dates.0._id')

        if (!setDateId) return

        if (!object.ops[0]) return

        // return just one op (the client currently only looks into the first op with c_set_dates)
        object.ops = [object.ops.find(op => op.path.includes('c_set_dates'))]

        if (!object.ops[0]) return

        // set the value the value currently set in the public user
        object.ops[0].value = this.scriptAsAdmin(() => {
          const publicUser = org.objects
            .c_public_users
            .find({ _id: object.context._id })
            .next()

          const setDate = publicUser.c_set_dates.find((setDate) => setDate._id.equals(setDateId))

          if (!setDate) return

          return setDate.c_date
        })

      }
    }
  }

  scriptAsAdmin(callback) {
    return script.as(this.SystemUser, {}, callback)
  }

}

module.exports = AuditsTransform