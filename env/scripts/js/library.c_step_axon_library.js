/***********************************************************

@script     AXON - Step creation Trigger

@brief     Library that covers triggers associated with the creation of Step objects

@author     Ugochukwu Nwajagu

@version    1.0.0

(c)2016-2021 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import faults from 'c_fault_lib'
import _ from 'lodash'
const moment = require('moment'),
      { trigger, log } = require('decorators'),
      { c_steps: Steps, bulk: Bulk } = org.objects,

      validateInputs = (context, old = {}) => {
        const c_type = context.c_type || old.c_type
        const c_maximum_length = context.c_maximum_length || old.c_maximum_length
        const c_minimum = context.c_minimum || old.c_minimum
        const c_maximum = context.c_maximum || old.c_maximum
        const c_style = context.c_style || old.c_style
        const c_multiple_lines = context.c_multiple_lines || old.c_multiple_lines
        const c_validation_regex = context.c_validation_regex || old.c_validation_regex
        const c_date_only = _.isBoolean(context.c_date_only) ? context.c_date_only : old.c_date_only
        const c_minimum_date = context.c_minimum_date || old.c_minimum_date
        const c_maximum_date = context.c_maximum_date || old.c_maximum_date
        const c_default_value = context.c_default_value || old.c_default_value
        const default_value = _.get(c_default_value, 'value') || c_default_value
        if (!default_value) return
        switch (c_type) {
          case 'numeric':
            validateNumericInputs(default_value, c_minimum, c_maximum, c_style)
            break
          case 'text':
            validateTextInputs(default_value, c_multiple_lines, c_maximum_length, c_validation_regex)
            break
          case 'datetime':
            validateDatetimeInputs(default_value, c_date_only, c_minimum_date, c_maximum_date)
            break
        }
      },

      validateNumericInputs = (c_default_value, c_minimum, c_maximum, c_style) => {

        if (c_minimum && (c_minimum > c_default_value)) {
          faults.throw('axon.invalidArgument.defaultValueLesserNumberNotAllowed')
        } else if (c_maximum && (c_maximum < c_default_value)) {
          faults.throw('axon.invalidArgument.defaultValueGreaterNumberNotAllowed')
        } else if ((typeof c_style === 'undefined' || c_style === false) && (c_default_value % 1 !== 0)) {
          faults.throw('axon.invalidArgument.defaultValueDecimalNotAllowed')
        }
      },

      validateTextInputs = (c_default_value, c_multiple_lines, c_maximum_length, c_validation_regex) => {

        const regexMatch = (regexPattern, valueToTest) => {
          const regex = RegExp(regexPattern)
          return regex.test(valueToTest)
        }

        if ((typeof c_multiple_lines === 'undefined' || c_multiple_lines === false) && ((/\n/g).test(c_default_value) === true)) {
          faults.throw('axon.invalidArgument.defaultValueMultiLineNotAllowed')
        } else if (c_maximum_length && (c_maximum_length < c_default_value.length)) {
          faults.throw('axon.invalidArgument.defaultValueLongerTextNotAllowed')
        } else if (c_validation_regex && !regexMatch(c_validation_regex, c_default_value)) {
          faults.throw('axon.invalidArgument.defaultValueRegexMismatch')
        }
      },

      validateDatetimeInputs = (c_default_value, c_date_only, c_minimum_date, c_maximum_date) => {

        const isDateOnly = moment(c_default_value, 'YYYY-MM-DD', true)
          .isValid()
        if (c_date_only && !isDateOnly) {
          faults.throw('axon.invalidArgument.defaultValueDatetimeNotAllowed')
        } else if (c_minimum_date && (new Date(c_minimum_date) > new Date(c_default_value))) {
          faults.throw('axon.invalidArgument.defaultValueLesserDateNotAllowed')
        } else if (c_maximum_date && (new Date(c_maximum_date) < new Date(c_default_value))) {
          faults.throw('axon.invalidArgument.defaultValueGreaterDateNotAllowed')
        }
      }

class StepTriggerLibrary {

  @log({ traceError: true })
  @trigger('create.before', {
    object: 'c_step'
  })
  static beforeStepCreate({ context }) {
    validateInputs(context)

    if (context.c_type === 'participant_id') {
      const pidSteps = org.objects.c_steps.find({ c_type: 'participant_id', c_task: context.c_task._id })
        .toArray()

      if (pidSteps.length > 0) {
        faults.throw('axon.validation.PIDStepAlreadyExists')
      }
    }

    if (_.isNumber(context.c_order)) return

    const match = !context.c_parent_step
      ? {
        c_task: context.c_task._id,
        c_parent_step: { $exists: false }
      }
      : { c_parent_step: context.c_parent_step._id }

    const cursor = org.objects.c_step.find(match)
      .paths('c_order')
      .sort({ c_order: -1 })

    const { c_order: maxOrder = -1 } = cursor.hasNext() ? cursor.next() : {}

    context.update('c_order', maxOrder + 1)

  }

  @log({ traceError: true })
  @trigger('update.before', {
    object: 'c_step'
  })
  static beforeStepUpdate({ context, old }) {
    validateInputs(context, old)
  }

  @log({ traceError: true })
  @trigger('delete.before', {
    object: 'c_step',
    principal: 'c_system_user'
  })
  static beforeDeleteStep({ old: oldStep }) {

    const stepToDeleteCursor = Steps
      .find({ _id: oldStep._id })
      .paths('c_order', 'c_task')

    if (!stepToDeleteCursor.hasNext()) return

    const stepToDelete = stepToDeleteCursor.next()

    const { c_order: order, c_task: task } = stepToDelete

    if (order === undefined) return

    // better safe than sorry
    if (!task._id) return

    const bulkOp = Bulk()

    Steps
      .find({ c_task: task._id, c_order: { $gt: order } })
      .sort({ c_order: 1 })
      .paths('c_order')
      .forEach(({ _id, c_order }) => {
        c_order--
        const cursor = Steps.updateOne({ _id }, { $set: { c_order: c_order } })
        bulkOp.add(cursor)
      })

    return bulkOp
  }

}

module.exports = StepTriggerLibrary