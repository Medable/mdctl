import moment from 'moment.timezone'
import {
  route,
  log,
  trigger,
  on,
  job,
  as
} from 'decorators'
import logger from 'logger'
import { isIdFormat } from 'util.id'
import faults from 'c_fault_lib'
import _ from 'lodash'
import StudyLibrary from 'c_axon_study_lib'
import notifGenerator from 'c_axon_notif_generator'
import NucleusUtils from 'c_nucleus_utils'
import i18n from 'i18n'

const {
  c_events,
  c_study: Study
} = org.objects
const { accessLevels, principals } = consts

export class ParticipantDeactivation {

  /**
   * @openapi
   * /routes/participant/deactivate:
   *  post:
   *    description: 'Deactivate a Participant'
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              c_public_user:
   *                type: string
   *              c_deactivation_reason_code:
   *                type: string
   *
   *    responses:
   *      '200':
   *        description: c_public_user object
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/components/schemas/c_public_user'
   *      '400':
   *        description: axon.invalidArgument.invalidObjectId or axon.invalidArgument.validAccountRequired
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_participant_deactivation',
    path: 'participant/deactivate'
  })
  static deactivateParticipant({ body }) {
    const { c_public_user: publicUserId, c_deactivation_reason_code } = body()
    if (!publicUserId || (publicUserId && !isIdFormat(publicUserId))) {
      faults.throw('axon.invalidArgument.invalidObjectId')
    }

    let publicUser = org.objects.c_public_user.find({ _id: publicUserId })
      .skipAcl()
      .grant(consts.accessLevels.read)

    if (!publicUser.hasNext()) {
      faults.throw('axon.notFound.instanceNotFound')
    }
    publicUser = publicUser.next()

    if (!publicUser.c_account) {
      faults.throw('axon.invalidArgument.validAccountRequired')
    }

    if (!c_deactivation_reason_code) {
      faults.throw('axon.invalidArgument.deactivationReasonCodeRequired')
    }

    ParticipantDeactivation.validateDeactivationReasonCode(c_deactivation_reason_code)

    ParticipantDeactivation.checkRouteAccess(publicUser.c_site._id, publicUser.c_study._id)

    // cancel scheduled c_axon_notifs
    ParticipantDeactivation.cancelNotifications(publicUser._id)

    // cancel other events
    ParticipantDeactivation.cancelTelevisitEvents(publicUser._id)

    // lock the participant's account
    org.objects.account.updateOne({ _id: publicUser.c_account._id }, { $set: { locked: true } })
      .skipAcl()
      .grant(consts.accessLevels.script)
      .execute()

    let deactivationFlag = org.objects.c_patient_flags
      .find({ c_identifier: 'c_axon_participant_deactivated' })
      .skipAcl()
      .grant(consts.accessLevels.read)
    // The flag would not exist in case the org with an existing study is upgraded to this new axon version
    // so in this case we create it to make the upgrade seamless
    deactivationFlag = deactivationFlag.hasNext() ? deactivationFlag.next() : StudyLibrary.createDeactivationPatientFlag(publicUser.c_study._id)

    return org.objects.c_public_users.updateOne(
      { _id: publicUserId },
      {
        $set: {
          c_status: 'Deactivated',
          audit: { message: c_deactivation_reason_code }
        },
        $push: {
          c_set_patient_flags: { c_identifier: deactivationFlag.c_identifier, c_flag: deactivationFlag._id, c_enabled: true }
        }
      }
    )
      .skipAcl()
      .lean(false)
      .grant(accessLevels.update)
      .execute()
  }

  static cancelNotifications(publicUserId) {
    const scheduledNotificationsId = org.objects.c_axon_notif.find({ c_public_user: publicUserId, c_status: 'scheduled' })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .map(notif => notif._id)

    if (scheduledNotificationsId.length) {
      notifGenerator.setStatus(scheduledNotificationsId, 'canceled', 'Participant Deactivated', 'c_axon_notif')
    }
  }

  // cancel non ATS events: c_televisit_event
  static cancelTelevisitEvents(publicUserId) {
    const eventIds = org.objects.c_event.find({ type: 'c_televisit_event', c_public_user: publicUserId, c_missed: false, c_completed: false })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .map(ev => ev._id)

    if (eventIds.length) {
      org.objects.c_event.updateMany({ _id: { $in: eventIds } }, { $set: { c_canceled: true } })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }
  }

  static checkRouteAccess(siteId, studyId) {
    const allowedRoles = ['Site User', 'Axon Site User', 'Site Investigator', 'Axon Site Investigator']
    // get the users roles
    const roles = NucleusUtils.getUserRolesSimple(script.principal._id, siteId, studyId)
      .map(v => v.toString())
    // get the ids of the allowed roles
    const allowedRoleIds = allowedRoles.map(v => consts.roles[v].toString())
    // check if the user roles are in the granted roles
    const hasAccess = allowedRoleIds.some(r => roles.indexOf(r) >= 0)

    if (!hasAccess) {
      faults.throw('axon.accessDenied.routeAccessDenied')
    }
  }

  static validateDeactivationReasonCode(deactivationReasonCode) {
    const validReason = i18n.translate(`deactivationReasonCodes.${deactivationReasonCode}`, { locale: 'en_US', namespace: 'siteapp-app' })
    if (!validReason) {
      faults.throw('axon.invalidArgument.deactivationReasonCodeInvalid')
    }
  }

}