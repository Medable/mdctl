/* eslint-disable no-throw-literal */
/***********************************************************

@script     Nucleus - Query Management Library

@brief      Query Management for Nucleus

@author     Nicolas Ricci

@version    1.0.0

(c)2016-2018 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import _ from 'underscore'
import { paths, id } from 'util'
import logger from 'logger'
import parser from 'c_nucleus_query_parser'
import nucUtils from 'c_nucleus_utils'
import cache from 'cache'
import moment from 'moment'
import counters from 'counters'

// ------------------------- Constants -------------------------

const QueryStatus = {
        Open: 'open',
        Responded: 'responded',
        Closed: 'closed',
        ClosedRequery: 'closed:requery',
        Cancelled: 'cancelled'
      },

      QueryType = {
        System: 'system',
        Manual: 'manual'
      }

const assert = (b, msg) => {
  if (!b) throw { code: 'kAssertionError', reason: msg }
  else return true
}

// ------------------------- Query Evaluator Logger -------------------------

class QevLog {

  constructor() {
    this.key = `QevLog-${+moment()}`
    this.currentLvl = []
    this.stack = [ this.currentLvl ]
  }

  save() {
    t = new Date()
    const res = JSON.parse(JSON.stringify(this.state))
    dirtyHack += new Date() - t
    // cache.set(this.key, res, 180)
  }

  get state() {
    return this.stack[0]
  }

  get height() { return this.stack.length }

  event(label, params, includeInfo = false) {
    const ev = { label }
    if (params) ev.params = params
    if (includeInfo) {
      ev.timestamp = moment()
        .toISOString()
      ev.memFree = script.getMemoryFree()
      ev.opsLeft = script.getOpsRemaining()
      ev.timeLeft = script.getTimeLeft()
    }

    this.currentLvl.push(ev)
    return this
  }

  push() {
    if (this.currentLvl.length === 0) { throw { code: 'kInvalidState', reason: 'Current level is empty. Nothing to push on.' } }
    const newLvl = []
    if (this.currentLvl[this.currentLvl.length - 1].subevents) { throw { code: 'kInvalidState', reason: 'Cannot push on an event that contains sub events.' } }

    this.currentLvl[this.currentLvl.length - 1].subevents = newLvl
    this.currentLvl = newLvl
    this.stack.push(newLvl)
    return this
  }

  pop() {
    if (this.stack.length < 2) { throw { code: 'kInvalidState', reason: 'Cannot pop on less than 2 level stack' } }
    this.stack.pop()
    this.currentLvl = this.stack[this.stack.length - 1]
    return this
  }

}

// ------------------------- Query Evaluator -------------------------

const unwrap = x => _.isArray(x) && x.length === 1 ? x[0] : x,

      $lit = x => x,

      // eslint-disable-next-line eqeqeq
      $eq = ([x, y]) => unwrap(x) == unwrap(y),
      // eslint-disable-next-line eqeqeq
      $neq = ([x, y]) => {
        if (moment.isMoment(x) && moment.isMoment(y)) {
          return !x.isSame(y)
        }
        // eslint-disable-next-line eqeqeq
        return x != y
      },

      typeCheckedComparison = f => ([x, y]) => {
        assert(x !== null, 'typeCheckedComparison: Left opreand cannot be null.')
        assert(y !== null, 'typeCheckedComparison: Right opreand cannot be null.')
        const _x = Number(unwrap(x)),
              _y = Number(unwrap(y))
        assert(!isNaN(_x), 'Cannot cast left opreand to be a Number.')
        assert(!isNaN(_y), 'Cannot cast left opreand to be a Number.')

        return f([_x, _y])
      },

      $gte = typeCheckedComparison(([x, y]) => x >= y),
      $gt = typeCheckedComparison(([x, y]) => x > y),
      $lt = typeCheckedComparison(([x, y]) => x < y),
      $lte = typeCheckedComparison(([x, y]) => x <= y),

      $min = args => _.chain(args)
        .min()
        .value(),

      $meets = ([x, y]) => {
        const _x = x !== null ? x : [],
              _y = y !== null ? y : []
        assert(_.isArray(_x), '$meets: left opreand expected to be ana array')
        assert(_.isArray(_y), '$meets: right opreand expected to be ana array')
        return _.intersection(_x, _y).length
      },

      $not = x => !x,

      $or = args => args.some(x => x),
      $and = args => args.every(x => x)

// this is a 'design buffer' to decouple how step store values
// and how the evaluator makes logic sense of that.
// c_value has diferent types depending on the step type
// this ensures that the value is adapted properly
// for use up the evaluation tree
function adapt(type, val) {
  if (qevLogger) qevLogger.event('adapt', { type, val, _typeof: typeof val }, false)
  switch (type) {
    case 'c_value_picker':
    case 'c_text_choice':
      if (_.isArray(val) && val.length === 0) { return null }
      if (_.isArray(val) && val.length === 1 && val[0] === null) { return null }
    // eslint-disable-next-line no-fallthrough
    case 'c_date':
      return moment(val)

    default:
      return val
  }
}

const $getResponse = function({ _id: stepId, isCrossForm, path } = { path: 'c_value' }) {
        if (qevLogger) qevLogger.event('$getResponse', { isCrossForm, pub: this.puId, stepId }, false)

        const stepType = paths.to(this, `getResponse.${stepId}.type`)

        if (!isCrossForm) {
          const sr = this.getResponse[stepId]
          if (!sr) return null
          return adapt(stepType, sr[path])
        } else {
        // this can be optimized, just making sure all works here
          t = new Date()
          const [ sr ] = org.objects.c_step_response
            .find({
              c_step: stepId,
              c_public_user: this.puId
            })
            .paths(['c_step', 'c_value', 'created', 'type'])
            .limit(1)
            .sort({ created: -1 })
            .toArray()
          findTime += new Date() - t
          if (!sr) return null
          assert(sr, `Failed to get Step Response. (Cross Form setpId) ${stepId}`)
          return adapt(sr.type, sr[path])
        }
      },

      $call = function(name) {
        return customFunctions[name].bind(this)()
      }

// ------- Custom Functions -------------------------------------

const customFunctions = {

  // Custom function to compensate for the fact that in prod
  // consent task responses and step responses within dont ahve consisten data
  // So we take it from the task response instead
  minConsentDate: function() {
    const consentsIds = org.objects.c_task
            .find({
              c_study: this.studyId,
              c_name: { $in: [ 'Patient Consent', 'Patient Consent (Site 003, 005)' ] }
            })
            .map(task => task._id),
          consentedDates = org.objects.c_task_response
            .find({
              'c_task._id': { $in: consentsIds },
              'c_public_user._id': this.puId
            })
            .paths(['created'])
            .map(tr => tr.created)

    return _.min(consentedDates)
  },

  validateDOB: function() {
    const { _id: stepId } = org.objects.c_step
            .find({
              'c_task._id': this.tId,
              c_name: 'Birth Date'
            })
            .paths('_id')
            .next(),
          dob = this.getResponse[stepId].c_value,
          consented = customFunctions['minConsentDate'].bind(this)(),
          age = (consented - dob) / (1000 * 60 * 60 * 24 * 365),
          validAge = age >= 18 && age < 66

    if (qevLogger) qevLogger.event('validateDOB', { dob, consented, age, validAge }, false)

    return !validAge
  },

  now: function() {
    return moment()
      .startOf('day')
  }
}

const evals = { $min, $not, $lit, $eq, $neq, $gt, $gte, $lt, $lte, $meets, $or, $and, $getResponse, $call }

function evalExpr(expr) {

  let result = expr
  if (_.isObject(expr)) {
    qevLogger.event('evalExpr', { expr: JSON.stringify(expr) })
      .push()
    const results = _.keys(expr)
      .map(key => {
        if (!evals[key]) { throw { code: 'kError', reason: `Internal Error. "${key}" is not an valid operator.` } }
        // Eval each key/op
        let value = expr[key]

        if (_.isArray(value)) { value = value.map(v => evalExpr.bind(this)(v)) } else if (_.isObject(value) && key !== '$getResponse') { value = evalExpr.bind(this)(value) }

        return evals[key].bind(this)(value)
      })

    result = results.length === 1 ? results[0] : results.every(x => x)
    qevLogger.event('evalExpr end', { result })
      .pop()
  }

  return result
}

function evaluateRule(ctx, rule) {
  let evaluationResult = false,
      sh = qevLogger.height
  try {
    evaluationResult = !!evalExpr.call(ctx, rule.c_rules)
  } catch (err) {
    for (;qevLogger.height > sh; qevLogger.pop()) { qevLogger.event('aborting due to error', { err }, false) }
  }
  qevLogger.event('rule eval result', { evaluationResult }, false)
  return evaluationResult
}

function evaluateQuery(tr, rule, qList, getResponse) {
  t = new Date()
  const {
    _id: trId,
    c_task: { _id: tId },
    c_site: { _id: siteId } = {},
    c_public_user: { _id: puId },
    c_study: { _id: studyId }
  } = tr
  findTime += new Date() - t

  const query = org.objects.c_query
    .find({ c_task_response: trId, c_query_rule: rule._id })
    .expand('c_query_rule')
    .skipAcl(1)
    .grant(4)

  if (!query.hasNext()) {
    qevLogger.event('new query', null, false)
    if (!evaluateRule({ trId, tId, puId, getResponse, studyId }, rule)) { return }
    const newQuery = {
            c_type: QueryType.System,
            c_status: QueryStatus.Open,
            c_query_rule: rule._id,
            c_task_response: trId,
            c_site: siteId,
            c_subject: puId,
            c_study: studyId,
            c_description: rule.c_message
          },
          isSingleRelevantStep = rule.c_relevant_steps.length === 1,
          stepResponseId = getResponse[_.first(rule.c_relevant_steps)] && getResponse[_.first(rule.c_relevant_steps)]._id,
          stepResponseExtention = isSingleRelevantStep && stepResponseId
            ? ({ c_step_response: stepResponseId })
            : undefined
    qList.push({ ...newQuery, ...stepResponseExtention })
  } else {
    qevLogger.event('old query', null, false)
    const { _id, c_status, c_query_rule, c_manually_closed, c_task_response: { _id: trId } } = query.next()

    if (c_status === QueryStatus.Cancelled) return
    if (c_manually_closed) return

    let ev = evaluateRule({ trId, tId, puId, getResponse, studyId }, c_query_rule),

        // If status was active (either open or responded) and
        // evaluation didn't change value we exit.
        newstat
    if (c_status === QueryStatus.Open && !ev) {
      newstat = QueryStatus.Closed
    } else if (c_status === QueryStatus.Responded && !ev) {
      newstat = QueryStatus.Closed
    } else if (c_status === QueryStatus.Closed && ev) {
      // future work: not just put open, but check if there are any notes
      newstat = QueryStatus.Open
    } else {
      return
    }

    qList.push({ _id, c_status: newstat })
  }

}

function getRelevantRules(stepIds) {

  t = new Date()

  if (stepIds.length === 0) {
    return []
  }

  const res = org.objects.c_query_rule
    .aggregate()
    .project({
      c_name: 1,
      c_rules: 1,
      c_message: 1,
      c_task: 1,
      c_relevant_steps: 1,
      meet: { $setIntersection: [
        // {$array: tr.c_step_responses.map(sr => sr.c_step._id)},
        { $array: stepIds },
        'c_relevant_steps'
      ] }
    })
    .skipAcl(true)
    .grant(4)
    .toArray()
    .filter(x => x.meet.length > 0)
  groupTime += new Date() - t

  return res
}

// combine this with the one below. One even better make a data fetching abstraction layer
function getSRS(trid) {
  const steps = org.objects.c_step_response.find({ c_task_response: trid })
          .paths(['c_step', 'c_value', 'created'])
          .toArray(),

        getResponse = steps.map(({ c_step: { _id: sId }, c_value, created, type, _id }) => ({ [sId]: { c_value, created, type, _id } }))
  return Object.assign({}, ...getResponse)
}

function getData(trid) {
  const t = new Date(),
        tr = org.objects.c_task_response.find({ _id: trid })
          .paths(['c_task', 'c_site', 'c_public_user', 'c_study', 'c_status'])
          .next(),

        steps = org.objects.c_step_response.find({ c_task_response: tr._id })
          .paths(['c_step', 'c_value', 'created'])
          .toArray()
  // Dynamic detection of relevant steps
  // tr.relevantStepIds = steps.map(x => x.c_step._id)

  // Static detection of relevant steps
  tr.relevantStepIds = getSteps(trid)
  tr.getResponse = steps.reduce((a, { c_step: { _id: sId } = {}, c_value, created, type, _id }) => {
    if (sId) {
      a[sId] = { c_value, created, type, _id }
    }
    return a
  }, {})
  findTime += new Date() - t
  return tr
}

function getSteps(tr) {
  const { c_task: { _id: tid } } = org.objects.c_task_response
          .find({ _id: tr })
          .paths(['c_task'])
          .next(),
        steps = org.objects.c_step
          .find({ 'c_task._id': tid })
          .paths(['c_name', 'c_type', 'c_disabled'])
          .toArray()
          .filter(s => s.c_type !== 'form' && s.c_type !== 'webview_form' && s.c_type !== 'section' && !s.c_disabled)
          .map(s => s._id)

  return steps
}

let qevLogger = null,
    apiTime = 0, findTime = 0, groupTime = 0, t = 0, dirtyHack = 0

function checkQueries(task_response) {
  let tr = getData(task_response._id),
      {
        _id: trId,
        c_task: { _id: tId },
        c_site: { _id: siteId } = {},
        c_public_user: { _id: puId },
        c_study: { _id: studyId },
        c_status,
        getResponse,
        relevantStepIds
      } = tr
  if (c_status === 'Inactive') return

  qevLogger = new QevLog()
  qevLogger.event('checkQueries start', {
    ctx: script.context,
    args: script.arguments

  }, true)

  let rules = getRelevantRules(relevantStepIds),
      [ ownRules, foreignRules ] = _.partition(rules, rule => `${rule.c_task._id}` === `${tId}`)

  qevLogger.event('triggered rules', {
    ownRules: ownRules.map(_.property('c_name')),
    foreignRules: foreignRules.map(_.property('c_name')),
    getResponse
  }, true)

  const qList = [],
        needsStatusUpdate = [ trId ]

  ownRules.forEach(rule => {
    qevLogger
      .event('evaluateQuery', { trId, rId: rule.c_name })
      .push()
      .event('start', null, true)
    evaluateQuery(tr, rule, qList, getResponse)
    qevLogger.event('end', null, true)
      .pop()
      .save()
  })

  qevLogger.event('fLoopStart', null, true)
  foreignRules.forEach(rule => {
    org.objects.c_task_response.find({
      c_public_user: puId,
      c_status: { $in: ['New', 'Complete', 'Incomplete'] }
    })
      .skipAcl(1)
      .grant(4)
      .forEach(tr => {
        if (`${rule.c_task._id}` === `${tr.c_task._id}`) {
          qevLogger
            .event('evaluateQuery', { trId: tr._id, rId: rule.c_name })
            .push()
            .event('start', null, true)
          evaluateQuery(tr, rule, qList, getSRS(tr._id))
          qevLogger.event('evaluateQuery end', null, true)
            .pop()
            .save()
          needsStatusUpdate.push(tr._id)
        }
      })
  })
  qevLogger.event('fLoopEnd', null, true)

  qevLogger.event('before insert', { qList, times: { dirtyHack, findTime, groupTime, apiTime: findTime + groupTime, remaining: script.getTimeLeft() } }, true)
    .save()
  const [ inserts, updates ] = _.partition(qList, q => !q._id)
  script.as(nucUtils.SystemUser.name, {}, () => {
    org.objects.c_query.insertMany(inserts)
      .skipAcl(1)
      .grant(5)
      .execute()
  })
  qevLogger.event('before update', null, true)
    .save()
  _.chain(updates)
    .groupBy(x => x.c_status)
    .mapObject((v, k) => {
      qevLogger.event('updateMany', { v, k }, true)
        .save()
      const x = script.as(nucUtils.SystemUser.name, {}, () => {
        return org.objects.c_query.updateMany({
          _id: { $in: v.map(y => y._id) }
        }, {
          $set: { c_status: k }
        })
          .skipAcl(1)
          .grant(5)
          .limit(1000)
          .execute()
      })
      qevLogger.event('AFTER updateMany', { x }, true)
        .save()

    })
    .value()

  qevLogger.event('before update trstat', null, true)
    .save()
  needsStatusUpdate.forEach(id => nucUtils.updateTaskResponseStatus(id))

  qevLogger.event('checkQueries end', null, true)
    .save()
}

// ---------------------------------------------------------------------------
//
// ------------------------ Creation and Compilation --------------------------
//
// ----------------------------------------------------------------------------

function getters(x) {
  if (_.isObject(x) && !_.isNull(x)) {
    return _.chain(x)
      .mapObject((v, k) => {
        if (k === '$getResponse') return [ v ]
        else return getters(v)
      })
      .values()
      .flatten()
      .value()
  }
  if (_.isArray(x)) {
    return _.chain(x)
      .map(getters)
      .flatten()
      .value()
  }
  return []
}

function compileGetter(arg) {
  const argError = () => { throw { code: 'kError', reason: 'Invalid $getResponse match argument', message: `Invalid match argument: ${JSON.stringify(arg)}` } }

  if (_.isNull(arg) || _.isEmpty(arg)) { argError() }

  const path = arg.path || 'c_value',

        matches = {}
  _.chain(arg)
    .keys()
    .filter(k => k.startsWith('c_') || k === '_id')
    .map(k => {
      const s = k.split('.')
      if (s.length === 1) { s.unshift('c_step') }
      if (s.length !== 2) { argError() }
      if (s[0] !== 'c_step' && s[0] !== 'c_task') { argError() }

      matches[s[0]] = Object.assign(matches[s[0]] || {}, { [s[1]]: arg[k] })
    })

  paths.to(matches, 'c_task.c_study', this.studyId)

  const tasks = org.objects.c_task
    .find(matches.c_task)
    .map(_.property('_id'))

  matches.c_step['c_task._id'] = { $in: tasks }
  let steps = org.objects.c_step
    .find(matches.c_step)
    .paths(['c_name', 'c_task', 'c_order', 'c_type'])
    .toArray()

  // logger.warn(matches.c_step);
  if (steps.length === 0) {
    if (matches.c_step.c_name) {
      throw { code: 'kQueryCreationError', reason: 'Empty $getResponse match', message: 'No such c_name.' }
    } else {
      throw { code: 'kQueryCreationError', reason: 'Empty $getResponse match', message: 'No such CDASH.' }
    }
  }

  // Prioritization of intraFrom steps
  let isCrossForm,
      [ intraForm, crossForm ] = _.partition(steps, s => `${s.c_task._id}` === this.taskId)
  if (intraForm.length > 0) {
    steps = intraForm
    isCrossForm = false
  } else {
    steps = crossForm
    isCrossForm = true
  }

  // logger.warn(`${this.taskId} - ${intraForm.map(x => x._id)} - ${crossForm.map(x => x._id)}`)
  if (steps.length === 1) {
    const theStep = steps[0]
    if (theStep.c_type === 'form' || theStep.c_type === 'webview_form' || theStep.c_type === 'section') {
      throw { code: 'kQueryCreationError', reason: 'Invalid $getResponse argument', message: `The argument resolves to either a section or form type step, which produces no output: ${JSON.stringify(arg)}` }
    }
    return { _id: theStep._id, path, isCrossForm }
  }
  if (steps.length > 1) {
    if (_.isNumber(arg.index)) {
      if (arg.index >= 0) return { _id: steps[arg.index]._id, path, isCrossForm }
      else throw { code: 'kQueryCreationError', reason: 'Invalid $getResponse index', message: `Invalid index: ${JSON.stringify(arg)}` }
    } else {
      // logger.error(arg);
      throw { code: 'kQueryCreationError', reason: 'Ambiguous $getResponse match', message: 'Multiple matches for the given argument.' }
    }
  }
}

// IMPORTANT NOTE: This works for the Otsuka rules. Things like
// Contemplating both being choices or the other awy around are
// not contemplated
function sanitizeTextChoices(c_rules) {
  const unsafes = []

  recurse(c_rules, '$eq', eqArgs => {
    // if (!(_.isObject(eqArgs[0]) && _.isObject(eqArgs[1]), 'invalid args in $eq')) throw 'assert'

    if (eqArgs[0].$getResponse) {
      /// logger.warn(eqArgs[0].$getResponse)

      const step = org.objects.c_step.find({ _id: eqArgs[0].$getResponse._id })
        .next()
      if (eqArgs[1].$getResponse || eqArgs[1] === null || eqArgs[1].$lit === null) return
      if (step.c_type === 'text_choice' || step.c_type === 'value_picker') {
        const opts = step.c_text_choices.map(_.property('c_value'))
        if (opts.indexOf(eqArgs[1]) === -1) { throw { code: 'kQueryCreationError', reason: 'Unsafe eq against text choice.', message: `${eqArgs[1]} not in [${opts}]` } }
      }
    }
  })
  return true
}

function recurse(x, hook, f) {
  if (_.isArray(x)) { return _.map(x, z => recurse(z, hook, f)) }

  if (_.isObject(x) && !_.isNull(x)) {
    return _.mapObject(x, (v, k) => {
      if (k === hook) return f(v)
      else return recurse(v, hook, f)
    })
  }

  return x
}

function createQuery({ c_name, c_study, c_task_name, c_rules, c_step, c_message } = {}) {

  if (!org.objects.c_study.find({ _id: c_study })
    .hasNext()) throw `No such study Id`

  // Find the task
  let c_task = org.objects.c_task.find({ c_name: c_task_name, 'c_study': c_study })
  if (!c_task.hasNext()) {
    throw { code: 'kQueryCreationError', reason: 'Task not found' }
  }
  c_task = c_task.next()._id

  c_rules = c_rules.trim()
  try {
    c_rules = parser.parse(c_rules)
  } catch (e) {
    throw { code: 'kQueryCreationError', reason: 'Parse Error', message: e.message }
  }
  c_rules = recurse(c_rules, '$getResponse', compileGetter.bind({ taskId: c_task, studyId: c_study }))

  sanitizeTextChoices(c_rules)

  const c_relevant_steps = getters(c_rules)
    .map(x => x._id)

  // logger.warn(c_rules);

  // padding polyfill
  // if (!String.prototype.padStart) {
  //   String.prototype.padStart = function padStart (targetLength, padString) {
  //     targetLength = targetLength >> 0 // truncate if number or convert non-number to 0;
  //     padString = String((typeof padString !== 'undefined' ? padString : ' '))
  //     if (this.length > targetLength) {
  //       return String(this)
  //     } else {
  //       targetLength = targetLength - this.length
  //       if (targetLength > padString.length) {
  //         padString += padString.repeat(targetLength / padString.length) // append to original to ensure we are longer than needed
  //       }
  //       return padString.slice(0, targetLength) + String(this)
  //     }
  //   }
  // }
  // let tCode = org.objects.c_task.find({_id: c_task}).paths('c_code').next().c_code
  // let number = `${  tCode ? counters.next(`QN${c_task}`) : counters.next('QNGENERAL')}`.padStart(3,'0')
  // let newCode = `${ tCode ? tCode : '' }${number}`;

  if (!org.objects.c_query_rule.find({ c_name })
    .hasNext()) {
    const res = org.objects.c_query_rule
      .insertOne({ c_name, c_task, c_rules, c_message, c_relevant_steps })
      .skipAcl(1)
      .grant(7)
      .execute()

    return org.objects.c_query_rule.find({ _id: res })
      .next()
  } else {
    const res = org.objects.c_query_rule
      .updateOne({ c_name }, { $set: { c_task, c_rules, c_message, c_relevant_steps } })
      .skipAcl(1)
      .grant(7)
      .lean(false)
      .execute()
    return res
  }

}

module.exports = {

  // Debug exports
  getters,
  compileGetter,
  createQuery,
  evaluateQuery,
  evalExpr,
  $getResponse,
  getRelevantRules,

  // Exports
  checkQueries,
  QueryType,
  QueryStatus
}