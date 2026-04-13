import nucUtils from 'c_nucleus_utils'
import req from 'request'
import faults from 'c_fault_lib'

let vsID = req.params.vsid

// this is an interesting workaround from James to the default limits when expanding sub property lists with a regualr query cursor
let vsCursor = org.objects.c_visit_schedules.aggregate().match({ _id: vsID }).skipAcl().grant(4).project({
  c_name: true,
  c_visits: {
    $expand: {
      limit: 50,
      pipeline: [{
        $project: {
          c_name: true,
          c_schedule: true,
          c_groups: {
            $expand: {
              pipeline: [{
                $project: {
                  c_name: true,
                  c_group_tasks: {
                    $expand: {
                      limit: 50,
                      paths: ['_id', 'c_assignment.c_name', 'c_assignment.c_key', 'c_schedule', 'c_notification_active', 'c_notification_times']
                    }
                  }
                }
              }]
            }
          }
        }
      }]
    }
  }
})
let returnVal = {}

if (vsCursor.hasNext()) {
  returnVal = nucUtils.removeDefaultProps(vsCursor.next())
} else {
  faults.throw('axon.invalidArgument.validVisitScheduleRequired')
}

script.exit(returnVal)