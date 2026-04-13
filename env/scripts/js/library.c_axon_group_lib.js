import {
  trigger,
  log,
  object
} from 'decorators'

import faults from 'c_fault_lib'

const {
  c_groups
} = org.objects

@object('c_group')
// eslint-disable-next-line no-undef
class GroupLibrary extends CortexObject {

  @log({ traceError: true })
  @trigger('create.before', { weight: 1 })
  static groupBeforeCreate({ new: newGroup }) {
    if (!this.hasValidVisit(newGroup)) {
      return faults.throw('axon.invalidArgument.invalidGroupVisit')
    }
  }

  @log({ traceError: true })
  @trigger('update.before', {
    weight: 1,
    if: {
      $ne: [{
        $indexOfArray: [
          '$$SCRIPT.arguments.modified',
          'c_visits'
        ]
      }, -1]
    }
  })
  static groupBeforeUpdate({ new: newGroup }) {
    if (!this.hasValidVisit(newGroup)) {
      return faults.throw('axon.invalidArgument.invalidGroupVisit')
    }
  }

  static hasValidVisit(newGroup) {
    const visits = newGroup.c_visits
    if (Array.isArray(visits) && visits.length) {
      const visitId = visits[visits.length - 1]
      const currentlyAssignedGroups = GroupLibrary.find()
        .where({ c_visits: visitId })
        .toList()
      if (currentlyAssignedGroups.data.length > 1) {
        return false
      }
      const groupItem = currentlyAssignedGroups.data[0]
      if (groupItem) {
        const groupId = groupItem._id
        if (groupId === newGroup._id) {
          return true
        }
      }
      const currentlyAssignedGroupCount = currentlyAssignedGroups.data.length
      return currentlyAssignedGroupCount === 0
    } else {
      return true
    }
  }

}