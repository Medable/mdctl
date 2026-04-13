/* eslint-disable camelcase */
/* eslint one-var: ["error", "consecutive"] */
import { query } from 'request'
import { genError } from 'c_axon_script_lib'
import nucUtils from 'c_nucleus_utils'

const { c_sites, c_site_users, c_studies, accounts } = org.objects,
      { c_study } = query,
      accountID = script.principal._id
let siteIDs, siteUserIDs
if (!nucUtils.isNewSiteUser(script.principal.roles)) {
  siteIDs = c_study && c_sites.find({ c_study })
    .paths('_id')
    .map(study => study._id)
  siteUserIDs = siteIDs && c_site_users.find({ c_account: accountID, c_site: { $in: siteIDs } })
    .paths('_id')
    .skipAcl()
    .grant(4)
    .map(siteUser => siteUser._id)
} else {
  const { c_site_access_list: siteAccessList } = accounts.find({ _id: accountID })
          .paths('c_site_access_list')
          .next(),
        siteAccessListIds = siteAccessList && siteAccessList.map(v => v.toString())
  siteUserIDs = siteAccessList
}

if (!c_study) genError('Study ID is required as "c_study" parameter', 400)

if (!Array.isArray(siteUserIDs) || !(siteUserIDs.length > 0)) { genError('Account is not assigned to any sites', 403) }

// This is a function to expand the study's groups and visit schedule to get all the task assignments
// The intention is the only task/step assets returned to the app are once actively used by the study
function getRelevantTaskIds(studyID) {
  let projection = {
        c_name: 1,
        c_groups: {
          $expand: {
            limit: 1000,
            pipeline: [{
              $project: {
                c_name: true,
                c_group_tasks: {
                  $expand: {
                    limit: 100,
                    paths: ['c_assignment._id']
                  }
                }
              }
            }]
          }
        },
        c_visit_schedules: {
          $expand: {
            limit: 50,
            pipeline: [{
              $project: {
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
                                    limit: 100,
                                    paths: ['c_assignment._id']
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
              }
            }]
          }
        }
      },

      // get the projection
      study = script.as(accountID, { principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
        return c_studies.aggregate()
          .match({ _id: studyID })
          .project(projection)
          .next()
      }),
      // extract task IDs from study groups
      taskIds = study.c_groups.data.reduce((a, v) => {

        v.c_group_tasks.data.forEach(gt => {
          a.push(gt.c_assignment._id.toString())
        })

        return a
      }, [])
  // extract task IDs from visit schedules
  taskIds = study.c_visit_schedules.data.reduce((a, v) => {
    v.c_visits.data.forEach(vis => {
      vis.c_groups.data.forEach(gp => {
        gp.c_group_tasks.data.forEach(gt => {
          a.push(gt.c_assignment._id.toString())
        })
      })
    })
    return a
  }, taskIds)
    .filter((v, i, s) => s.indexOf(v) === i)

  return taskIds

}

const taskIDs = getRelevantTaskIds(c_study),
      // get the steps in those tasks that contain file props
      steps = org.objects.c_steps
        .find({
          c_task: { $in: taskIDs },
          c_type: { $in: ['document_section', 'image_capture', 'image_choice', 'instruction', 'web_view', 'completion'] }
        })
        .skipAcl()
        .grant(4)
        .include('c_image.content')
        .passive()
        .map(step => step),
      // Extract all the file properties into a single array
      files = steps.reduce((a, v) => {
        if (v.c_image && v.c_image.path && v.c_image.state === 2) {
          a.push(v.c_image)
        } else if (Array.isArray(v.c_assets) && v.c_assets.length > 0) {
          a.push(...v.c_assets.map(i => i.c_file)
            .filter(file => file.state === 2))
        } else if (Array.isArray(v.c_image_choices) && v.c_image_choices.length > 0) {
          a.push(...v.c_image_choices.map(i => i.c_image)
            .filter(file => file.state === 2))
        }
        return a
      }, [])

return files