import { query } from 'request'
import faults from 'c_fault_lib'

const { c_branches, c_groups, c_group_tasks, c_steps, c_studies, c_tasks } = org.objects

function removeDefaultProps(entity, removeID) {
  const keys = Object.keys(entity)

  for (let i = 0; i < keys.length; i += 1) {
    const currKey = keys[i]

    if (currKey !== '_id' && currKey !== 'object') {
      const keyCheck = currKey.split('c_')

      if (keyCheck.length <= 1) {
        delete entity[currKey]
      }
    } else if (currKey === '_id' && removeID) {
      delete entity._id
    }
  }

  return entity
}

function cleanDocArr(docs, refs) {
  if (Array.isArray(docs)) {
    for (let i = 0; i < docs.length; i += 1) {
      const currDoc = docs[i]
      delete currDoc._id

      if (Array.isArray(refs)) {
        for (let i = 0; i < refs.length; i += 1) {
          const currRef = refs[i]

          if (currDoc[currRef] && currDoc[currRef]._id) {
            currDoc[currRef] = currDoc[currRef]._id
          }
        }
      }
    }
  }

  return docs
}

if (!query.c_study) faults.throw('axon.invalidArgument.validStudyRequired')

const res = {}
res.c_study = removeDefaultProps(c_studies.find({ _id: query.c_study }).next())
cleanDocArr(res.c_study.c_information)
cleanDocArr(res.c_study.c_menu_config)
cleanDocArr(res.c_study.c_resources)
cleanDocArr(res.c_study.c_subject_menu_config)

res.c_tasks = { data: c_tasks.find({ c_study: query.c_study }).map(task => removeDefaultProps(task)) }
res.c_groups = { data: c_groups.find({ c_study: query.c_study }).map(group => removeDefaultProps(group)) }
res.c_group_tasks = { data: c_group_tasks.find({ c_group: { $in: res.c_groups.data.map(group => group._id) } }).map(groupTask => {
  cleanDocArr(groupTask.c_flow_rules)
  return removeDefaultProps(groupTask)
}) }

const taskIDs = res.c_tasks.data.map(task => task._id)
res.c_steps = { data: c_steps.find({ c_task: { $in: taskIDs } }).map(step => {
  if (step.c_assets) delete step.c_assets
  if (step.c_image) delete step.c_image
  if (step.c_image_choices) delete step.c_image_choices

  cleanDocArr(step.c_google_fit_permissions)
  cleanDocArr(step.c_quantity_types)
  cleanDocArr(step.c_text_choices)

  return removeDefaultProps(step)
}) }
res.c_branches = { data: c_branches.find({ c_task: { $in: taskIDs } }).map(branch => {
  cleanDocArr(branch.c_conditions)
  return removeDefaultProps(branch)
}) }

script.exit(res)