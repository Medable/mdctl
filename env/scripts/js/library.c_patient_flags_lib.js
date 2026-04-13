const { trigger, log, as, on } = require('decorators')
const faults = require('c_fault_lib')
const { isEqual } = require('lodash')
const {
  c_public_users: PublicUsers,
  c_steps: Steps,
  c_patient_flags: PatientFlags,
  c_task: Tasks,
  event: Event,
  c_step_responses,
  c_visits
} = org.objects
const logger = require('logger')
const moment = require('moment.timezone')

class PatientFlagsLib {

  static TYPES = {
    TASK_COMPLETE: 'taskComplete',
    TASK_COMPLETE_SUCCESS: 'taskComplete:success',
    TASK_COMPLETE_FAILED: 'taskComplete:failed',
    VISIT_CONFIRMATION: 'visitConfirmation',
    BOOLEAN_STEP_VALUE: 'booleanStepValue',
    TEXT_CHOICE_STEP_VALUE: 'textChoiceStepValue',
    NUMERIC_STEP_VALUE: 'numericStepValue'
  }

  static taskRelatedTypes() {
    return [this.TYPES.TASK_COMPLETE, this.TYPES.TASK_COMPLETE_SUCCESS, this.TYPES.TASK_COMPLETE_FAILED]
  }

  @on('axon__swap_flag')
  @as('c_system_user', { principal: { skipAcl: true, grant: 8 }, safe: false })
  static onAxonSwapFlag({ flagId, publicUserId }) {
    logger.info('onAxonSwapFlag', { flagId, publicUserId })
    const [publicUser] = PublicUsers.find({ _id: publicUserId })
      .toArray()
    if (!publicUser) {
      return
    }
    const patientFlags = publicUser.c_set_patient_flags.map(v => {
      let value = v.c_enabled
      if (v.c_flag._id.equals(flagId)) {
        value = !value
      }
      return {
        c_flag: v.c_flag._id,
        c_identifier: v.c_identifier,
        c_enabled: value
      }
    })
    PublicUsers.updateOne({ _id: publicUserId }, { $set: { c_set_patient_flags: patientFlags } })
      .execute()
  }

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_patient_flag', weight: 1, principal: 'c_system_user' })
  static validatePatientFlagOnCreation({ new: newPatientFlag }) {

    const { c_conditions: conditions } = newPatientFlag

    conditions.forEach(condition => {

      const { c_type, c_task_completion, c_boolean_step, c_text_choice_step, c_numeric_step, c_visit } = condition

      const isTaskRelatedCondition = this
        .taskRelatedTypes()
        .includes(c_type)

      if (isTaskRelatedCondition) {

        if (c_visit || c_boolean_step || c_text_choice_step || c_numeric_step || !c_task_completion) {

          faults.throw('axon.invalidArgument.invalidTaskRelatedCondition')

        }

      } else if (this.TYPES.VISIT_CONFIRMATION === c_type) {

        if (c_boolean_step || c_text_choice_step || c_numeric_step || c_task_completion || !c_visit) {
          faults.throw('axon.invalidArgument.invalidVisitRelatedCondition')
        }

      } else if ([this.TYPES.BOOLEAN_STEP_VALUE, this.TYPES.NUMERIC_STEP_VALUE, this.TYPES.TEXT_CHOICE_STEP_VALUE].includes(c_type)) {

        if ((!c_boolean_step || !c_text_choice_step || !c_numeric_step) && (c_task_completion || c_visit)) {

          faults.throw('axon.invalidArgument.invalidBooleanRelatedCondition')

        }

      } else if (this.TYPES.TEXT_CHOICE_STEP_VALUE === c_type) {

        if (c_boolean_step || !c_text_choice_step || c_numeric_step || c_task_completion || c_visit) {

          faults.throw('axon.invalidArgument.invalidTextChoiceRelatedCondition')

        }
      } else if (this.TYPES.NUMERIC_STEP_VALUE === c_type) {

        if (c_boolean_step || c_text_choice_step || !c_numeric_step || c_task_completion || c_visit) {

          faults.throw('axon.invalidArgument.invalidNumericRelatedCondition')

        }
      }

    })

    this.areConditionsValid(conditions)

    this.updatePatientFlagTaskObject(conditions)

  }

  @log({ traceError: true })
  @trigger('update.before', {
    object: 'c_patient_flag',
    weight: 1,
    principal: 'c_system_user',
    if: {
      $gte: [{
        $indexOfArray: [
          '$$SCRIPT.arguments.modified',
          'c_conditions'
        ]
      }, 0]
    }
  })
  static validatePatientFlagOnUpdate({ new: newPatientFlag, old: oldPatientFlag, body }) {

    const { c_conditions: newConditions } = newPatientFlag

    const { c_conditions: oldConditions } = oldPatientFlag

    const request = require('request')

    let normalizedConditions = []

    if (request.method === 'PATCH') {

      const patchArr = body()

      normalizedConditions = this.getConditionsFromPatch(patchArr, { newConditions, oldConditions })

    } else {

      // conditions that are not in the oldConditions
      const realNewConditions = newConditions
        .filter(newCondition => {
          const isInOldConditions = oldConditions.find(({ _id: oldConditionId }) => oldConditionId.equals(newCondition._id))
          return !isInOldConditions
        })

      normalizedConditions.push(...oldConditions, ...realNewConditions)
    }

    this.areConditionsValid(normalizedConditions)

    // ensure we delete invalid configurations
    // if the condition is task related and it happens to have c_boolean_step then we need to delete that value
    // similarly with boolean related flags, in this case we delete the task completion value
    normalizedConditions
      .forEach(condition => {

        const isTaskRelatedCondition = this
          .taskRelatedTypes()
          .includes(condition.c_type)

        if (isTaskRelatedCondition) {
          newPatientFlag.delete(`c_conditions.${condition._id}.c_boolean_step`)
          newPatientFlag.delete(`c_conditions.${condition._id}.c_text_choice_step`)
          newPatientFlag.delete(`c_conditions.${condition._id}.c_numeric_step`)
        } else {
          newPatientFlag.delete(`c_conditions.${condition._id}.c_task_completion`)
        }
      })

    this.updatePatientFlagTaskObject(normalizedConditions)
  }

  @trigger('update.after', { name: 'flagSwapChecking', object: 'c_public_user', weight: 1, principal: 'c_system_user' })
  static afterUpdatePatientFlag({ new: newPu, old: oldPU, modified }) {
    if (modified.includes('c_set_patient_flags')) {
      const ids = newPu.c_set_patient_flags.map(v => v.c_flag._id)
      const pf = org.objects.c_patient_flags.find({ _id: { $in: ids } }).skipAcl().grant(4)
        .toArray()
        .filter(f => f.c_swap_flag_time_in_days > 0)
      if (pf.length) {
        for (const flag of pf) {
          const oldFlag = oldPU.c_set_patient_flags.find(v => v.c_flag._id.equals(flag._id))
          const newFlag = newPu.c_set_patient_flags.find(v => v.c_flag._id.equals(flag._id))
          if (oldFlag && newFlag && oldFlag.c_enabled !== newFlag.c_enabled) {
            const [event] = Event.find({ key: `flag-swap-${flag._id.toString()}-${newPu._id.toString()}` }).skipAcl().grant(4)
              .toArray()
            if (event) {
              // we need to remove event since it was sawpped before it time
              Event.deleteOne({ _id: event._id }).skipAcl().grant(8)
                .execute()
            }
          }
        }
      }
    }
  }

  static getFlagsUpdateForAuthTask(taskId, publicUserId) {
    const conditionsToEval = []
    const isTaskRelatedToFlag = PatientFlags
      .find({
        'c_conditions.c_task_completion': taskId
      })
      .hasNext()

    if (isTaskRelatedToFlag) {
      conditionsToEval.push(
        {
          type: this.TYPES.TASK_COMPLETE,
          objectId: taskId
        },
        {
          type: this.TYPES.TASK_COMPLETE_SUCCESS,
          objectId: taskId
        }
      )

      const publicUser = PublicUsers
        .find({ _id: publicUserId })
        .paths('c_set_patient_flags')
        .next()

      const updateBody = this.getPublicUserUpdate(publicUser, conditionsToEval)

      if (updateBody.$push || updateBody.$set) {
      // This object performs 2 purposes
      // it allows regenerations to be queued
      // it helps the `as-needed` regeneration process so we know that an anchor date may
      // have changed the events of an assignments we generated previously

        const updatedFlags = ((updateBody.$push && updateBody.$push.c_set_patient_flags.map(v => v.c_flag)) || [])
          .concat((updateBody.$set && updateBody.$set.c_set_patient_flags.map(v => v.c_flag)) || [])

        script.fire('c_flags_did_change', publicUserId, updatedFlags)

      }

      return updateBody
    }

  }

  static getFlagsUpdate(taskResponse) {

    const publicUserRef = taskResponse.c_public_user

    if (!publicUserRef) return

    const conditionsToEval = this.checkStepResponses(taskResponse) || []

    const isTaskRelatedToFlag = PatientFlags
      .find({
        'c_conditions.c_task_completion': taskResponse.c_task._id
      })
      .hasNext()

    if (isTaskRelatedToFlag) {

      if (taskResponse.c_completed) {

        conditionsToEval.push({
          type: this.TYPES.TASK_COMPLETE,
          objectId: taskResponse.c_task._id
        })

      }

      const successValue = taskResponse.c_success

      const type = successValue ? this.TYPES.TASK_COMPLETE_SUCCESS : this.TYPES.TASK_COMPLETE_FAILED

      conditionsToEval.push({
        type,
        objectId: taskResponse.c_task._id
      })

    }

    const publicUser = PublicUsers
      .find({ _id: publicUserRef._id })
      .paths('c_set_patient_flags')
      .next()

    const updateBody = this.getPublicUserUpdate(publicUser, conditionsToEval)

    if (updateBody.$push || updateBody.$set) {
      // This object performs 2 purposes
      // it allows regenerations to be queued
      // it helps the `as-needed` regeneration process so we know that an anchor date may
      // have changed the events of an assignments we generated previously

      const updatedFlags = ((updateBody.$push && updateBody.$push.c_set_patient_flags.map(v => v.c_flag)) || [])
        .concat((updateBody.$set && updateBody.$set.c_set_patient_flags.map(v => v.c_flag)) || [])

      script.fire('c_flags_did_change', publicUserRef._id, updatedFlags)
    }

    return updateBody
  }

  @as(script.principal, { safe: false, principal: { skipAcl: true, grant: 'read' } })
  static getFlagsUpdateVisit(visitEvent, skipped = false) {
    const publicUserRef = visitEvent.c_public_user

    if (!publicUserRef) return

    const visit = c_visits.find({ _id: visitEvent.c_schedule_visit._id })
      .next()

    const isVisitRelatedToFlag = PatientFlags
      .find({
        'c_conditions.c_visit': visitEvent.c_schedule_visit._id
      })
      .hasNext()

    const conditionsToEval = []
    if (isVisitRelatedToFlag) {

      conditionsToEval.push({
        type: this.TYPES.VISIT_CONFIRMATION,
        objectId: visitEvent.c_schedule_visit._id,
        id: skipped ? visit.c_visit_flag_skipped._id : visit.c_visit_flag_confirmed._id
      })

    }

    const publicUser = PublicUsers
      .find({ _id: publicUserRef._id })
      .paths('c_set_patient_flags')
      .next()

    const updateBody = this.getPublicUserUpdate(publicUser, conditionsToEval)

    if (updateBody.$push || updateBody.$set) {
      // This object performs 2 purposes
      // it allows regenerations to be queued
      // it helps the `as-needed` regeneration process so we know that an anchor date may
      // have changed the events of an assignments we generated previously

      const updatedFlags = ((updateBody.$push && updateBody.$push.c_set_patient_flags.map(v => v.c_flag)) || [])
        .concat((updateBody.$set && updateBody.$set.c_set_patient_flags.map(v => v.c_flag)) || [])

      script.fire('c_flags_did_change', publicUserRef._id, updatedFlags)
    }

    return updateBody
  }

  static areConditionsValid(conditions) {

    const booleanSteps = conditions
      .filter(({ c_type }) => c_type === this.TYPES.BOOLEAN_STEP_VALUE)
      .map(({ c_boolean_step }) => c_boolean_step._id)

    const numericSteps = conditions
      .filter(({ c_type }) => c_type === this.TYPES.NUMERIC_STEP_VALUE)
      .map(({ c_numeric_step }) => c_numeric_step._id)

    const textChoiceSteps = conditions
      .filter(({ c_type }) => c_type === this.TYPES.TEXT_CHOICE_STEP_VALUE)
      .map(({ c_text_choice_step }) => c_text_choice_step._id)

    if (booleanSteps.length) {

      const groupedResults = Steps
        .aggregate()
        // unfortunately we can't match by c_type
        .match({ _id: { $in: booleanSteps } })
        .group({ _id: 'c_type', count: { $count: '_id' } })
        .toArray()

      const [{ _id: stepType }] = groupedResults

      // if there are more than one type in the grouped results then it means there is at least 2 types of steps and this is wrong
      // also if there is only one it must be boolean
      if (groupedResults.length > 1 || stepType !== 'boolean') {

        faults.throw('axon.invalidArgument.isNotBooleanStep')

      }

    }

    if (numericSteps.length) {

      const groupedResults = Steps
        .aggregate()
        // unfortunately we can't match by c_type
        .match({ _id: { $in: numericSteps } })
        .group({ _id: 'c_type', count: { $count: '_id' } })
        .toArray()

      const [{ _id: stepType }] = groupedResults

      // if there are more than one type in the grouped results then it means there is at least 2 types of steps and this is wrong
      // also if there is only one it must be numeric
      if (groupedResults.length > 1 || stepType !== 'numeric') {

        faults.throw('axon.invalidArgument.isNotNumericStep')

      }

    }

    if (textChoiceSteps.length) {

      const groupedResults = Steps
        .aggregate()
        // unfortunately we can't match by c_type
        .match({ _id: { $in: textChoiceSteps } })
        .group({ _id: 'c_type', count: { $count: '_id' } })
        .toArray()

      const [{ _id: stepType }] = groupedResults

      // if there are more than one type in the grouped results then it means there is at least 2 types of steps and this is wrong
      // also if there is only one it must be text choice
      if (groupedResults.length > 1 || stepType !== 'text_choice') {

        faults.throw('axon.invalidArgument.isNotTextChoiceStep')

      }

    }

    conditions
      .forEach((condition, index) => {

        const rest = conditions.slice((index + 1), conditions.length)

        switch (condition.c_type) {

          case this.TYPES.BOOLEAN_STEP_VALUE: {

            this.checkIfTaskIsAlreadyUsed(condition.c_boolean_step._id, rest)

            break
          }
          case this.TYPES.TEXT_CHOICE_STEP_VALUE: {

            this.checkIfStepIsAlreadyUsed(condition.c_text_choice_step._id, rest)

            break
          }

          case this.TYPES.NUMERIC_STEP_VALUE: {

            this.checkIfStepIsAlreadyUsed(condition.c_numeric_step._id, rest)

            break
          }

          case this.TYPES.TASK_COMPLETE:

            this.checkIfTaskIsAlreadyUsed(condition.c_task_completion._id, rest)

            break

          case this.TYPES.TASK_COMPLETE_SUCCESS:

            this.checkIfTaskIsAlreadyUsed(condition.c_task_completion._id, rest, { taskRelatedTypes: [this.TYPES.TASK_COMPLETE] })

            break

          case this.TYPES.TASK_COMPLETE_FAILED:

            this.checkIfTaskIsAlreadyUsed(condition.c_task_completion._id, rest, { taskRelatedTypes: [this.TYPES.TASK_COMPLETE] })

            break

        }

      })

    return true
  }

  static checkIfStepIsAlreadyUsed(stepId, conditions) {
    conditions.forEach((restCondition) => {

      if (restCondition.c_boolean_step && restCondition.c_boolean_step._id.equals(stepId)) {

        faults.throw('axon.invalidArgument.stepIdAlreadyInUse')

      } else if (restCondition.c_numeric_step && restCondition.c_numeric_step._id.equals(stepId)) {

        faults.throw('axon.invalidArgument.stepIdAlreadyInUse')

      } else if (restCondition.c_text_choice_step && restCondition.c_text_choice_step._id.equals(stepId)) {

        faults.throw('axon.invalidArgument.stepIdAlreadyInUse')

      }

    })
  }

  static checkIfTaskIsAlreadyUsed(taskId, conditions, options = {}) {
    conditions.forEach((restCondition) => {

      const validTaskRelatedConditions = options.taskRelatedTypes
        ? options.taskRelatedTypes
        : this.taskRelatedTypes()

      const isTaskRelatedCondition = validTaskRelatedConditions
        .includes(restCondition.c_type)

      if (isTaskRelatedCondition) {

        if (restCondition.c_task_completion._id.equals(taskId)) {

          faults.throw('axon.invalidArgument.taskIdAlreadyInUse')

        }

      } else if (restCondition.c_type === this.TYPES.BOOLEAN_STEP_VALUE) {

        const { c_task: { _id: taskIdInStep } } = Steps
          .find({ _id: restCondition.c_boolean_step._id })
          .paths('c_task')
          .next()

        if (taskId.equals(taskIdInStep)) {

          faults.throw('axon.invalidArgument.taskIdAlreadyInUse')

        }

      } else if (restCondition.c_type === this.TYPES.NUMERIC_STEP_VALUE) {

        const { c_task: { _id: taskIdInStep } } = Steps
          .find({ _id: restCondition.c_numeric_step._id })
          .paths('c_task')
          .next()

        if (taskId.equals(taskIdInStep)) {

          faults.throw('axon.invalidArgument.taskIdAlreadyInUse')

        }
      } else if (restCondition.c_type === this.TYPES.TEXT_CHOICE_STEP_VALUE) {

        const { c_task: { _id: taskIdInStep } } = Steps
          .find({ _id: restCondition.c_text_choice_step._id })
          .paths('c_task')
          .next()

        if (taskId.equals(taskIdInStep)) {

          faults.throw('axon.invalidArgument.taskIdAlreadyInUse')

        }
      }
    })
  }

  static computeSubjectFlags(publicUserFlags, conditionsToEval) {

    // new flags and existing flags
    let result = [[], []]

    const hasId = conditionsToEval.some(v => v.id)

    const find = {
      ...(hasId
        ? { _id: { $in: conditionsToEval.map(v => v.id) } }
        : {
          c_conditions: {
            $elemMatch: {
              $or: [
                {
                  c_boolean_step: { $in: conditionsToEval.map(v => v.objectId) },
                  c_type: this.TYPES.BOOLEAN_STEP_VALUE
                },
                {
                  c_text_choice_step: { $in: conditionsToEval.map(v => v.objectId) },
                  c_type: this.TYPES.TEXT_CHOICE_STEP_VALUE
                },
                {
                  c_numeric_step: { $in: conditionsToEval.map(v => v.objectId) },
                  c_type: this.TYPES.NUMERIC_STEP_VALUE
                },
                {
                  c_task_completion: { $in: conditionsToEval.map(v => v.objectId) },
                  c_type: { $in: [this.TYPES.TASK_COMPLETE, this.TYPES.TASK_COMPLETE_SUCCESS, this.TYPES.TASK_COMPLETE_FAILED] }
                },
                {
                  c_visit: { $in: conditionsToEval.map(v => v.objectId) },
                  c_type: this.TYPES.VISIT_CONFIRMATION
                }
              ]
            }
          }
        })
    }

    const matchingPatientFlagsConfig = PatientFlags
      .find(find)
      .skipAcl()
      .grant('read')
      .toArray()

    if (matchingPatientFlagsConfig.length === 0) return result

    const modifiedPatientFlags = matchingPatientFlagsConfig

      .map(patientFlagConfig => {
        const evalutedPatientFlag = this.evaluatePatientFlag(patientFlagConfig, conditionsToEval)
        const existingFlag = evalutedPatientFlag && publicUserFlags.find(setFlag => setFlag.c_identifier === evalutedPatientFlag.c_identifier)
        if (!existingFlag) {
          return evalutedPatientFlag
        }

        if (existingFlag.c_enabled !== evalutedPatientFlag.c_enabled) {
          return { ...existingFlag, ...evalutedPatientFlag }
        }
        return undefined // not modified.
      })
      .filter(modifiedPatientFlags => modifiedPatientFlags)

    result = modifiedPatientFlags.reduce((acc, curr) => {

      if (curr._id) {

        // delete these props because they can't be sent during update operation
        delete curr.c_flag.object

        delete curr.c_flag.path

        acc[1].push(curr)

      } else {

        acc[0].push(curr)

      }

      return acc

    }, result)

    return result

  }

  static evaluatePatientFlag(patientFlagConfig, conditionsToEval) {
    let newPublicUserFlag

    const conditions = patientFlagConfig.c_conditions

    const stepConditions = conditions.filter(c => [this.TYPES.BOOLEAN_STEP_VALUE, this.TYPES.TEXT_CHOICE_STEP_VALUE, this.TYPES.NUMERIC_STEP_VALUE].includes(c.c_type))
    const taskConditions = conditions.filter(c => [...this.taskRelatedTypes(), this.TYPES.VISIT_CONFIRMATION].includes(c.c_type))

    const stepConditionsToEval = conditionsToEval.filter(c => [this.TYPES.BOOLEAN_STEP_VALUE, this.TYPES.TEXT_CHOICE_STEP_VALUE, this.TYPES.NUMERIC_STEP_VALUE].includes(c.type))
    const taskConditionsToEval = conditionsToEval.filter(c => [...this.taskRelatedTypes(), this.TYPES.VISIT_CONFIRMATION].includes(c.type))

    let matchingConditionForMultiple = false
    const matchedItems = stepConditions.reduce((acc, condition) => {
      const ids = [condition.c_boolean_step, condition.c_text_choice_step, condition.c_numeric_step].filter(item => item)
      const matchingCondition = stepConditionsToEval.find(c => ids.map(i => i._id.toString())
        .includes(c.objectId.toString()))
      if (matchingCondition) {
        let match = false
        if (Array.isArray(matchingCondition.value)) {
          match = matchingCondition.value.includes(condition.c_compare_value)
        } else {
          if (condition.c_type === this.TYPES.BOOLEAN_STEP_VALUE && !condition.c_compare_value) {
            condition.value = matchingCondition.value // let's keep backward compatibility with current boolean flags
            match = true // let's keep backward compatibility with current boolean flags
          } else {
            match = condition.c_compare_value === matchingCondition.value
          }
        }
        if (match) {

          acc.push(condition)
        }
      }
      return acc
    }, [])

    if (patientFlagConfig.c_operator === 'AND') {
      matchingConditionForMultiple = matchedItems.length === stepConditions.length
    } else if (patientFlagConfig.c_operator === 'OR' || !patientFlagConfig.c_operator) {
      matchingConditionForMultiple = matchedItems.length > 0
    } else {
      throw new Error('Unsupported operator')
    }

    const matchedTaskItems = taskConditions.reduce((acc, condition) => {
      const ids = [condition.c_task_completion, condition.c_visit].filter(item => item)
      const matchingCondition = taskConditionsToEval.find(c => ids.map(i => i._id.toString())
        .includes(c.objectId.toString()) && c.type === condition.c_type)
      if (matchingCondition) {
        acc.push(condition)
      }
      return acc
    }, [])
    const matchingCondition = matchedTaskItems.length > 0

    if (matchingConditionForMultiple || matchingCondition) {

      let value
      if (matchingConditionForMultiple) {
        if (matchedItems.length > 1) {
          const conditionEnableValue = matchedItems.filter(c => c.c_enable)
          const conditionDisableValue = matchedItems.filter(c => !c.c_enable)
          value = conditionEnableValue.length > conditionDisableValue.length
        } else {
          if (typeof matchedItems[0].value !== 'undefined') {
            value = matchedItems[0].value
          } else {
            value = matchedItems[0].c_enable
          }
        }
      }

      if (matchingCondition) {
        if (matchedTaskItems.length > 1) {
          const conditionEnableValue = matchedItems.filter(c => c.c_enable)
          const conditionDisableValue = matchedItems.filter(c => !c.c_enable)
          if (typeof value !== 'undefined') {
            value = value && conditionEnableValue.length > conditionDisableValue.length
          } else {
            value = conditionEnableValue.length > conditionDisableValue.length
          }
        } else {
          if (typeof value !== 'undefined') {
            value = value && matchedTaskItems[0].c_enable
          } else {
            if (typeof matchedTaskItems[0].value !== 'undefined') {
              value = matchedTaskItems[0].value
            } else {
              value = matchedTaskItems[0].c_enable
            }
          }
        }
      }

      newPublicUserFlag = {
        c_identifier: patientFlagConfig.c_identifier,
        c_flag: patientFlagConfig._id,
        c_enabled: value
      }
    }

    return newPublicUserFlag
  }

  static updatePublicUser(publicUser, updateBody) {

    const isModified = !!Object.keys(updateBody).length

    if (isModified) {

      //

      PublicUsers
        .updateOne({ _id: publicUser._id }, updateBody)
        .execute()

    }
  }

  static getPublicUserUpdate(publicUser, conditionsToEval) {

    const { c_set_patient_flags: existingFlags } = publicUser

    let updateBody = {}

    const [newFlags, editedFlags] = this.computeSubjectFlags(existingFlags, conditionsToEval)

    if (newFlags.length) {

      /// we need to set the events for time base swapping flags.
      const flags = PatientFlags.find({ _id: { $in: newFlags.map(v => v.c_flag) } })
        .toArray()
      const swappingFlags = flags.filter(v => v.c_swap_flag_time_in_days)
      if (swappingFlags.length) {
        for (const flag of swappingFlags) {
          Event.insertOne({
            type: 'script',
            event: 'axon__swap_flag',
            key: `flag-swap-${flag._id.toString()}-${publicUser._id.toString()}`,
            start: moment()
              .tz(publicUser.c_tz || 'UTC')
              .add(flag.c_swap_flag_time_in_days, 'days')
              .toDate(),
            param: {
              flagId: flag._id,
              publicUserId: publicUser._id
            }
          })
            .bypassCreateAcl()
            .grant(8)
            .execute()
        }
      }

      if (updateBody.$push) {

        updateBody.$push.c_set_patient_flags = updateBody.$push.c_set_patient_flags.concat(newFlags)

      } else {

        updateBody = { ...updateBody, $push: { c_set_patient_flags: newFlags } }
      }

    }

    if (editedFlags.length) {

      if (updateBody.$set) {

        updateBody.$set.c_set_patient_flags = updateBody.$set.c_set_patient_flags.concat(editedFlags)
      } else {

        updateBody = { ...updateBody, $set: { c_set_patient_flags: editedFlags } }

      }
    }

    return updateBody

  }

  static isDeeplyEqual(value, other) {

    // we need to do this to convert all ids into strings for comparison
    const serializableValue = JSON.parse(JSON.stringify(value))

    const serializableOther = JSON.parse(JSON.stringify(other))

    return isEqual(serializableValue, serializableOther)

  }

  static getConditionsFromPatch(patchArray, { newConditions, oldConditions }) {

    return patchArray

      .reduce((acc, operation) => {

        switch (operation.op) {

          case 'set': {

            const { c_conditions } = operation.value
            if (c_conditions) {
              c_conditions.forEach(modifiedCondition => {

                const previousValue = oldConditions.find(c => c._id.equals(modifiedCondition._id))

                const newValue = newConditions.find(c => c._id.equals(modifiedCondition._id))

                const hasChanged = this.isDeeplyEqual(previousValue, newValue) === false

                if (hasChanged) {

                  // as the initial value of normalizedConditions are exising conditions we look for it to know the index
                  const index = acc.findIndex(normalizedCond => normalizedCond._id.equals(modifiedCondition._id))

                  // we replace the value
                  acc[index] = newValue

                }

              })
            }
            break

          }

          case 'push': {

            const realNewCondtions = newConditions
              .filter(newCondition => {

                const isExisting = oldConditions.find(oldCondition => oldCondition._id.equals(newCondition._id))

                // return those not existing in the old array, these are the real "new"
                return !isExisting

              })

            acc.push(...realNewCondtions)

            break

          }

          case 'remove': {

            const { c_conditions } = operation.value

            c_conditions.forEach(removedConditionId => {

              const indexOfCond = acc.findIndex(normalizedCond => normalizedCond._id.equals(removedConditionId))

              const isPresent = indexOfCond !== -1

              if (isPresent) {

                acc.splice(indexOfCond, 1)

              }

            })

            break

          }
        }

        return acc

      }, oldConditions)
  }

  // We want to check all the responses in a task response to see if any match the flag criteria
  static checkStepResponses(taskResponse) {

    // get all relevant step response data
    const steps = c_step_responses.find({ c_task_response: taskResponse._id, type: { $in: ['c_boolean', 'c_numeric', 'c_text_choice'] } })
      .skipAcl()
      .grant('read')
      .paths('c_step', 'type', 'c_value')
      .toArray()

    if (!steps.length) return

    // get any flags that may be connected to any of the steps
    const relatedFlags = PatientFlags
      .find({
        $or: [
          { 'c_conditions.c_boolean_step': { $in: steps.map(v => v.c_step._id) } },
          { 'c_conditions.c_text_choice_step': { $in: steps.map(v => v.c_step._id) } },
          { 'c_conditions.c_numeric_step': { $in: steps.map(v => v.c_step._id) } }
        ]
      })
      .toArray()

    if (!relatedFlags.length) return

    // for each relevant flag, assess the condition and perform the update
    const types = {
      c_boolean: this.TYPES.BOOLEAN_STEP_VALUE,
      c_text_choice: this.TYPES.TEXT_CHOICE_STEP_VALUE,
      c_numeric: this.TYPES.NUMERIC_STEP_VALUE
    }

    return relatedFlags.reduce((acc, flag) => {

      // filter for boolean step conditions on the flag
      flag.c_conditions.filter(v => v.c_boolean_step || v.c_text_choice_step || v.c_numeric_step)
        .forEach(condition => {

          let stepId

          if (condition.c_boolean_step) {
            stepId = condition.c_boolean_step._id
          } else if (condition.c_text_choice_step) {
            stepId = condition.c_text_choice_step._id
          } else if (condition.c_numeric_step) {
            stepId = condition.c_numeric_step._id
          }
          const stepResponse = steps.find(v => v.c_step._id.equals(stepId))
          if (stepResponse) {
            const value = stepResponse.c_value
            acc.push({
              type: types[stepResponse.type],
              objectId: stepId,
              value
            })
          }

        })

      return acc

    }, [])

  }

  static updatePatientFlagTaskObject(conditions) {
    const taskIds = conditions
      .map(condition => {
        if (condition.c_task_completion) {
          return condition.c_task_completion._id
        }
        const step = condition.c_boolean_step || condition.c_text_choice_step || condition.c_numeric_step
        if (step) {
          const { c_task: task } = Steps
            .find({ _id: step._id })
            .paths('_id', 'c_task')
            .next()

          return task._id
        }

        return undefined
      })
      .filter(condition => condition)
    const result = Tasks
      .updateMany({ _id: { $in: taskIds } }, { $set: { c_updates_schedule: true } })
      .execute()
    if (result.writeErrors.length) {
      const [error] = result.writeErrors

      throw Fault.create(error)
    }

  }

}

module.exports = PatientFlagsLib