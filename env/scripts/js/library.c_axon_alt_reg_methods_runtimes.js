import {
  route,
  log
} from 'decorators'
import { rBool } from 'util.values'
import { AltRegMethodsValidators } from 'c_axon_alt_reg_methods_validators'
import moment from 'moment'
import {
  AltRegMethodsLibrary,
  UserInvitationProcessors,
  SubjectInfoRequestProcessors,
  ResendInviteLibrary
} from 'c_axon_alt_reg_methods'

class AltRegMethodsRuntimes {

  /**
   * @openapi
   * /invite_users:
   *  post:
   *    description: 'Invite a User to a Study'
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              c_group:
   *                type: string
   *                description: Group ID
   *              c_site:
   *                type: string
   *                description: Site ID
   *              c_visit_schedule:
   *                type: string
   *                description: Visit schedule ID
   *              emails:
   *                type: string
   *                description: emails
   *              c_public_user:
   *                type: string
   *                description: Public user id
   *              locale:
   *                type: string
   *                description: Locale
   *              c_username:
   *                type: string
   *                description: Username
   *              c_mobile:
   *                type: string
   *                description: User mobile
   *
   *    responses:
   *      '200':
   *        description:
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                c_public_user:
   *                  type: string
   *                email:
   *                  type: string
   *                mobile:
   *                  type: string
   *                username:
   *                  type: string
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_axon_invite_users',
    path: 'invite_users',
    authValidation: 'legacy',
    weight: 0,
    description: 'Route to invite users to a study',
    environment: '*',
    label: 'Axon - Invite Users',
    optimized: false,
    principal: null,
    acl: [
      'account.public'
    ]
  })
  static inviteUsersRoute({ body }) {
    const { c_groups, c_studies, c_sites } = org.objects
    const validator = AltRegMethodsValidators.c_axon_invite_users

    let { c_group, c_site, c_visit_schedule, emails, c_public_user, locale = '', c_username, c_mobile } = body()
    AltRegMethodsLibrary.grantAccessToInviteUsersRoute(c_site)
    const { email, mobile } = validator.validateRouteParams(c_group, emails, c_mobile, c_site, c_visit_schedule)
    const group = c_group
            ? AltRegMethodsLibrary.cursorForOne(c_groups, { _id: c_group })
              .next()
            : null,
          study = group
            ? AltRegMethodsLibrary.cursorForOne(c_studies, { _id: group.c_study._id })
              .paths(
                'c_name',
                'c_default_subject_visit_schedule',
                'c_supported_locales',
                'c_subject_invite_validation',
                'c_store_invite_data',
                'c_invite_code_ttl',
                'c_enable_alt_reg',
                'c_requires_invite'
              )
              .next()
            : AltRegMethodsLibrary.cursorForOne(c_studies)
              .paths(
                'c_name',
                'c_default_subject_visit_schedule',
                'c_supported_locales',
                'c_subject_invite_validation',
                'c_store_invite_data',
                'c_invite_code_ttl',
                'c_enable_alt_reg',
                'c_requires_invite'
              )
              .next()

    locale = validator.validateInviteLocale(study, locale, c_site)
    validator.validateStudyRequiresInvite(study.c_requires_invite)

    const subjectInviteValidation = study.c_subject_invite_validation || 'pin_only'

    const processor = UserInvitationProcessors[subjectInviteValidation]
    return c_group
      ? processor.processAltRegUserInvite(
        c_public_user,
        locale,
        email,
        mobile,
        c_username,
        c_visit_schedule,
        c_group,
        study,
        c_site
      )
      : processor.processAltRegUserInvite(
        c_public_user,
        locale,
        email,
        mobile,
        c_username,
        c_visit_schedule,
        null,
        study,
        c_site
      )
  }

  /**
   * @openapi
   * /study_subject_information:
   *  get:
   *    description: 'c_axon_hybrid_subject_info'
   *    parameters:
   *      - name: c_public_user
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: c_study
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: c_access_code
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: c_email
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: c_username
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: c_mobile
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *
   *    responses:
   *      '200':
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                c_public_user:
   *                  type: object
   *                c_study:
   *                  type: object
   *                c_site:
   *                  type: object
   *
   *        description: c_event object
   */
  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'c_axon_hybrid_subject_info',
    path: 'study_subject_information',
    authValidation: 'legacy',
    weight: 0,
    environment: '*',
    label: 'Axon - Hybrid - Subject Info',
    optimized: false,
    principal: 'c_system_user',
    acl: [
      'account.anonymous'
    ]
  })
  static studySubjectInfoRoute({ req }) {
    const validator = AltRegMethodsValidators.c_axon_hybrid_subject_info

    const { c_public_user, c_study, c_access_code, c_email, c_mobile, c_username } = req.query

    const { study, groups } = validator.validateRouteParams(c_study)

    const subjectInviteValidation = study.c_subject_invite_validation || 'pin_only'

    const processor = SubjectInfoRequestProcessors[subjectInviteValidation]
    return processor.processSubjectInfoRequest(
      c_email,
      c_mobile,
      c_username,
      c_access_code,
      c_public_user,
      study,
      groups
    )
  }

  /**
   * @openapi
   * /resend_invite:
   *  get:
   *    description: 'c_participant_events'
   *    parameters:
   *      - name: c_public_user
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: c_site
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: locale
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: c_email
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: c_mobile
   *        in: query
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *
   *    responses:
   *      '200':
   *        description: an array containing a c_public_user object
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/components/schemas/c_public_user'
   */
  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'c_axon_hybrid_resend_invite',
    path: 'resend_invite',
    authValidation: 'legacy',
    weight: 0,
    description: 'Route to resend an invite',
    environment: '*',
    label: 'Axon - Hybrid - Resend Invite',
    optimized: false,
    principal: null,
    acl: [
      'account.public'
    ]
  })
  static resendInviteRoute({ req }) {
    const validator = AltRegMethodsValidators.c_axon_hybrid_resend_invite

    const { c_public_user, c_site, c_email, locale = '', c_mobile, c_study_code } = req.query
    AltRegMethodsLibrary.grantAccessToResendInviteUsersRoute(c_site)

    const { publicUser, study } = validator.validateRouteParams(c_public_user, c_site, locale)

    const storeInviteData = rBool(study.c_store_invite_data, true),
          inviteCodeTtl = study.c_invite_code_ttl,
          enableAltReg = study.c_enable_alt_reg

    // If user has accepted or already has an account, we still resend the same code without updating anything.
    return ResendInviteLibrary.processAltRegResendInvite(
      publicUser,
      study,
      c_public_user,
      storeInviteData,
      enableAltReg,
      locale,
      c_email,
      c_mobile,
      inviteCodeTtl,
      c_study_code
    )
  }

}