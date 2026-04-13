import {
  trigger,
  log
} from 'decorators'

import faults from 'c_fault_lib'
import cache from 'cache'

const {
  c_task_responses,
  c_step_response,
  c_steps,
  c_public_user,
  c_studies,
  c_sites
} = org.objects

const DCR_MANUAL_EXECUTION_IN_PROGRESS_CACHE_KEY = 'dcr:manual_execution_in_progress'

class ParticipantIDLibrary {

    @log({ traceError: true })
    @trigger('update.after', { object: 'c_task_response', weight: 1, inline: true })
  static setParticipantIDFromTaskResponse() {
    if (!script.arguments.new.c_completed) {
      return
    }

    if (!script.arguments.new.hasOwnProperty('c_success') && !script.arguments.old.hasOwnProperty('c_success')) {
      return
    }

    const { c_participantid_on_visit } = this.getStudyConfiguration()

    if (!c_participantid_on_visit) {
      return
    }

    const taskResponseId = script.arguments.new._id,
          publicUserID = script.arguments.old.c_public_user && script.arguments.old.c_public_user._id

    if (publicUserID) {
      this.setParticipantID(taskResponseId, publicUserID)
    }
  }

    @log({ traceError: true })
    @trigger('create.before', 'update.before', { object: 'c_public_user', weight: 1, inline: true })
    static validateParticipantIDTrigger({ event, previous, current }) {
      const { c_format_spec_subject_id, c_protocol_number, c_participantid_on_visit } = this.getStudyConfiguration()
      if (current.c_number === undefined) {
        return
      }

      if (event === 'update.before') {
        const isDcrManualExecutionInProgress = cache.get(DCR_MANUAL_EXECUTION_IN_PROGRESS_CACHE_KEY) || false
        const isDcrOrInternalUser = script.principal.username === 'dcr_intake__system_user' ||
          (script.principal.email && script.principal.email.endsWith('@medable.com'))
        const isDcrRequest = isDcrManualExecutionInProgress && isDcrOrInternalUser

        const hasParticipantIdChanged = previous.c_number && current.c_number && previous.c_number !== current.c_number
        if (!isDcrRequest && c_participantid_on_visit && hasParticipantIdChanged) {
          faults.throw('axon.validationError.participantIDCannotBeChanged')
        }
      }

      const siteId = current.c_site
        ? current.c_site._id
        : previous && previous.c_site ? previous.c_site._id : ''

      const participantIDFormatSpec = this.getParticipantIDFormatPattern(c_format_spec_subject_id, siteId, c_protocol_number)

      this.validateParticipantID(participantIDFormatSpec, current.c_number)
    }

    @log({ traceError: true })
    static validateParticipantID(participantIDFormatSpec, participantID) {
      const regex = new RegExp(participantIDFormatSpec)
      const isValid = regex.test(participantID)
      if (!isValid) {
        faults.throw('axon.validation.notMatchingParticipantFormatSpec')
      }
    }

    @log({ traceError: true })
    static getParticipantIDFormatPattern(participantIDFormatSpec, siteId, protocolNumber) {
      const site = this.getSiteDetails(siteId)

      let newParticipantIDFormatSpec

      if (participantIDFormatSpec) {
        newParticipantIDFormatSpec = this.getParticipantIDFormatPatternFromSpec(participantIDFormatSpec, site, protocolNumber)
      }

      return newParticipantIDFormatSpec
    }

    @log({ traceError: true })
    static getParticipantIDFormatPatternFromSpec(participantIDFormatSpec, site, protocolNumber) {
      if (participantIDFormatSpec.includes('{PROTOCOL}') && !protocolNumber) {
        faults.throw('axon.validation.protocolRequired')
      }

      if (participantIDFormatSpec.includes('{COUNTRY}') && !site.c_country) {
        faults.throw('axon.validation.siteCountryRequired')
      }

      const newSiteNumber = site.c_number.replace(/[!^@#$%&*()_+]/g, '\\$&')

      const formatSpec = `^${participantIDFormatSpec
        .replace('{COUNTRY}', site.c_country)
        .replace('{PROTOCOL}', protocolNumber)
        .replace(/@/g, '\\w')
        .replace(/#/g, '\\d')}$`

      return formatSpec.replace('{SITE}', newSiteNumber)
    }

    @log({ traceError: true })
    static getStudyConfiguration() {
      return c_studies
        .find()
        .skipAcl()
        .grant(consts.accessLevels.delete)
        .paths('c_automatic_participant_id_generation', 'c_format_spec_subject_id',
          'c_participantid_on_visit', 'c_protocol_number')
        .next()
    }

    @log({ traceError: true })
    static getSiteDetails(siteId) {
      if (siteId) {
        return c_sites.find({ _id: siteId })
          .skipAcl()
          .grant(consts.accessLevels.delete)
          .paths('c_number', 'c_country')
          .next()
      } else {
        return {
          c_number: '',
          c_country: ''
        }
      }
    }

    @log({ traceError: true })
    static setParticipantID(taskResponseId, publicUserID) {
      const participantID = this.getParticipantIDFromStepResponse(taskResponseId)

      if (!participantID) {
        return
      }

      if (this.checkIfParticipantIDExists(participantID)) {
        faults.throw('axon.validation.participantIDAlreadyExists')
      }

      c_public_user
        .updateOne({ _id: publicUserID }, { $set: { c_number: participantID } })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }

    @log({ traceError: true })
    static checkIfParticipantIDExists(participantId) {
      const participantID = c_public_user.find({ c_number: participantId })
        .skipAcl()
        .grant(consts.accessLevels.read)

      return !!participantID.hasNext()
    }

    @log({ traceError: true })
    static getParticipantIDFromStepResponse(taskResponseId) {
      const c_task_response = c_task_responses
        .find({ _id: taskResponseId })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .include('c_step_responses')
        .next()

      const stepResponseIds = c_task_response.c_step_responses.data.map(sr => sr._id)

      const c_step_responses = c_step_response.find({ _id: { $in: stepResponseIds } })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .include('c_step', 'c_value')
        .toArray()

      const stepIds = c_step_responses.reduce((accumulator, stepResponse) => {
        if (stepResponse.c_step) {
          accumulator.push(stepResponse.c_step._id)
        }
        return accumulator
      }, [])

      const participantIDStepCursor = c_steps.find({ _id: { $in: stepIds }, c_type: 'participant_id' })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .include('c_step')

      if (!participantIDStepCursor.hasNext()) {
        return
      }

      const participantIDStep = participantIDStepCursor.next()

      const participantIDStepResponse = c_step_responses.filter(stepResponse => stepResponse.c_step._id.equals(participantIDStep._id))

      return participantIDStepResponse[0].c_value
    }

    @log({ traceError: true })
    static getParticipantIDFromTaskResponse(c_task_response) {
      const participantIDStep = c_task_response
        .c_step_responses
        .find(sr => sr.type === 'c_participant_id')

      return participantIDStep ? participantIDStep.c_value : null
    }

    @log({ traceError: true })
    static validateParticipantIDBeforeTaskResponseCreation(taskResponse) {
      const { c_participantid_on_visit } = this.getStudyConfiguration()

      if (!c_participantid_on_visit) {
        return
      }

      const participantID = this.getParticipantIDFromTaskResponse(taskResponse)

      if (!participantID) {
        return
      }

      const participant = c_public_user.find({ _id: taskResponse.c_public_user })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .next()

      if (participant.c_number) {
        faults.throw('axon.validationError.participantIDCannotBeChanged')
      }

      if (this.checkIfParticipantIDExists(participantID)) {
        faults.throw('axon.validation.participantIDAlreadyExists')
      }

      const { c_format_spec_subject_id, c_protocol_number } = this.getStudyConfiguration()
      const participantIDFormatSpec = this.getParticipantIDFormatPattern(c_format_spec_subject_id, participant.c_site._id, c_protocol_number)

      this.validateParticipantID(participantIDFormatSpec, participantID)
    }

}

module.exports = ParticipantIDLibrary