/*
 * Shared library for fetching participant responses suitable for PI Oversight deltas.
 */

const {
  c_task_responses
} = org.objects

/**
 * mapStepResponseValue
 * Pure helper to translate step response values into display values.
 *
 * For text choice steps, step responses store the internal `c_value` and the step carries the label map
 * in `c_text_choices` (c_value -> c_text). This helper maps internal values to display text.
 *
 * @param {Object} params
 * @param {string} [params.stepResponseType] - e.g. 'c_text_choice'
 * @param {Object|null} [params.step] - expanded c_step document
 * @param {*} params.value - raw step response value
 * @returns {*} mapped display value (same shape as input)
 */
export function mapStepResponseValue({ stepResponseType, step, value }) {
  const rawValue = value
  const isTextChoice = (stepResponseType === 'c_text_choice' || (step && step.c_type === 'text_choice'))
  const rawChoices = step && step.c_text_choices
  const choices = (Array.isArray(rawChoices) && rawChoices) || (rawChoices && Array.isArray(rawChoices.data) && rawChoices.data) || []

  if (!isTextChoice || choices.length === 0 || rawValue == null) {
    return rawValue
  }

  const choiceByValue = choices.reduce((acc, choice) => {
    if (choice && choice.c_value != null) acc[String(choice.c_value)] = choice.c_text
    return acc
  }, {})

  if (Array.isArray(rawValue)) {
    const mapped = rawValue.map(v => {
      const key = String(v)
      return Object.prototype.hasOwnProperty.call(choiceByValue, key) ? choiceByValue[key] : v
    })

    return mapped
  }

  const key = String(rawValue)
  return Object.prototype.hasOwnProperty.call(choiceByValue, key) ? choiceByValue[key] : rawValue
}

/**
 * listParticipantResponses
 * @param {Object} params
 * @param {string} params.participantId - c_public_user _id
 * @param {string} params.siteId - c_site _id
 * @param {string} params.studyId - c_study _id (reserved for future use)
 * @param {string|Date} [params.sinceUtc] - ISO string or Date; only responses after this are returned
 * @returns {Array} responses
 */
export function listParticipantResponses({ participantId, siteId, studyId, sinceUtc }) {
  const where = {
    'c_public_user._id': participantId,
    c_site: siteId,
    c_study: studyId
  }

  if (sinceUtc) {
    where.created = { $gt: new Date(sinceUtc) }
  }

  const cursor = c_task_responses
    .find(where)
    .paths([
      '_id',
      'c_task._id',
      'c_task.c_name',
      'c_task.c_key',
      'c_task.c_observation_type',
      'c_public_user._id',
      'c_public_user.c_number',
      'c_step_responses._id',
      'c_step_responses.c_value',
      'c_step_responses.c_step.c_order',
      'c_step_responses.c_step.c_type',
      'c_step_responses.c_step.c_name',
      'c_step_responses.c_step.c_question',
      'c_step_responses.c_step.c_text',
      'c_step_responses.c_step.c_text_choices',
      'c_step_responses.c_personal_data',
      'c_step_responses.type',
      'c_step_responses.created',
      'created',
      'c_end'
    ])
    .expand(['c_task', 'c_public_user', 'c_step_responses.c_step'])
    .skipAcl()
    .grant('read')

  const rows = cursor.toArray()
  const responses = []

  rows.forEach(tr => {
    const stepResponses = ((tr.c_step_responses && tr.c_step_responses.data) || [])
    stepResponses.forEach(sr => {
      const step = sr.c_step || null
      const mappedValue = mapStepResponseValue({ stepResponseType: sr.type, step, value: sr.c_value })

      responses.push({
        timestamp: sr.created,
        activity: tr.c_task ? tr.c_task.c_name : null,
        question: step ? step.c_name : null,
        name: step ? step.c_name : null,
        order: step ? step.c_order : null,
        question_text: step ? step.c_question : null,
        value: mappedValue,
        personalData: sr.c_personal_data || false,
        stepResponseId: sr._id,
        taskResponseCompletedDate: tr.c_end,
        taskId: tr.c_task ? tr.c_task._id : null,
        taskResponseId: tr._id
      })
    })
  })

  return responses
}

export default { listParticipantResponses, mapStepResponseValue }