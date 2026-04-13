import { transform } from 'decorators-transform'
import config from 'config'
import request from 'request'

@transform
class SiteTasksRoleAccess {

  result(result) {
    const nonAvailabilityDate = '1970-01-01'
    const R4_2_PINNED_VERSION = 42000
    const studyPinnedVersion = this.getStudyPinnedVersion()
    const axonRoleMap = {
      'site_user': consts.roles.c_axon_site_user.toString(),
      'site_investigator': consts.roles.c_axon_site_investigator.toString(),
      'site_monitor': consts.roles.c_axon_site_monitor.toString()
    }
    const siteUser = org.objects.accounts.find({ _id: script.principal._id })
      .paths('c_site_access_list', 'roles')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()[0]
    const siteAccessList = (siteUser.c_site_access_list && siteUser.c_site_access_list.map(s => s.toString())) || []
    const siteTaskDependencies = config.get('ab__site_task_dependencies')

    if (siteAccessList.includes(request.params.siteId.toString())) {
      const siteRoles = siteUser.roles
        .filter(role => Object.values(axonRoleMap).includes(role.toString()))
        .map(role => role.toString())
      result = result.map(element => {
        const restrictedRoles = element.c_group_task.c_assignment.c_roles.map(role => axonRoleMap[role]) || []
        if (this.isSiteInvestigatorOnlyTask(element.c_group_task.c_assignment) && (studyPinnedVersion >= R4_2_PINNED_VERSION)) {
          return element
        }
        if (restrictedRoles.length === 0 || siteRoles.filter(role => restrictedRoles.includes(role.toString())).length > 0) {
          return element
        }

        element.c_group_task.c_start_date = nonAvailabilityDate
        element.c_group_task.c_end_date = nonAvailabilityDate
        return element
      })
    }

    const publicUser = script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: 'read' } }, () => {
      return org.objects.c_public_user.find({ _id: request.params.publicUserId })
        .expand('c_set_patient_flags')
        .paths('c_set_patient_flags')
        .toArray()[0]
    })

    result = result.map(element => {
      const groupTaskCKey = element.c_group_task.c_key
      const taskDependencies = siteTaskDependencies[groupTaskCKey]
      if (!taskDependencies) {
        return element
      } else {
        for (const dependency of taskDependencies) {
          const patientFlag = publicUser.c_set_patient_flags.find(flag => flag.c_identifier.toString() === dependency.c_identifier)
          const startDependency = dependency.c_enabled
          if (
            (!patientFlag && startDependency) ||
            (patientFlag && patientFlag.c_enabled !== dependency.c_enabled)
          ) {
            element.c_group_task.c_start_date = nonAvailabilityDate
            element.c_group_task.c_end_date = nonAvailabilityDate
            return element
          }
        }

        return element
      }
    })

    return result
  }

  getStudyPinnedVersion() {
    return org.objects.c_study
      .find()
      .paths('c_pinned_version')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()[0]
      .c_pinned_version
  }

  isSiteInvestigatorOnlyTask(task) {
    return task.c_roles.length === 1 && task.c_roles[0] === 'site_investigator'
  }
}

module.exports = SiteTasksRoleAccess
