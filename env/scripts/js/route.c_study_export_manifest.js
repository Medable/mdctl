/***********************************************************

@script     Axon - Generate Study Export Manifest

@brief      Get the export manifest

@author     Fiachra Matthews

@version    4.6.0

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

/* eslint-disable camelcase, one-var */

import req from 'request'
import faults from 'c_fault_lib'

const { c_branches, c_groups, c_group_tasks, c_query_rules, c_sites, c_steps, c_studies, c_tasks, c_visits, c_visit_schedules } = org.objects,
      c_study = req.params.c_study

if (!c_study) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}

const study = c_studies.find({ _id: c_study }).paths('c_key').next(),
      tasks = c_tasks.find({ c_study: study._id }).paths('c_key').toArray(),
      studyGroups = c_groups.find({ c_study: study._id }).paths('c_key').toArray(),
      sites = c_sites.find({ c_study: study._id }).paths('c_key').toArray(),
      visitSchedules = c_visit_schedules.find({ c_study: study._id }).paths('c_key').toArray(),
      visits = c_visits.find({ c_visit_schedules: { $in: visitSchedules.map(v => v._id) } }).paths('c_key').toArray(),
      visitGroups = c_groups.find({ c_visits: { $in: visits.map(v => v._id) } }).paths('c_key').toArray(),
      groups = [...studyGroups, ...visitGroups],
      steps = c_steps.find({ c_task: { $in: tasks.map(v => v._id) } }).paths('c_key').toArray(),
      queryRules = c_query_rules.find({ c_task: { $in: tasks.map(v => v._id) } }).paths('c_key').toArray(),
      branches = c_branches.find({ c_task: { $in: tasks.map(v => v._id) } }).paths('c_key').toArray(),
      taskAssignments = c_group_tasks.find({ c_group: { $in: groups.map(v => v._id) } }).paths('c_key').toArray(),
      manifest = {
        object: 'manifest',
        c_study: {
          includes: [study.c_key]
        },
        c_task: {
          includes: tasks.map(v => v.c_key)
        },
        c_site: {
          includes: sites.map(v => v.c_key)
        },
        c_visit_schedule: {
          includes: visitSchedules.map(v => v.c_key)
        },
        c_visit: {
          includes: visits.map(v => v.c_key)
        },
        c_group: {
          includes: groups.map(v => v.c_key)
        },
        c_step: {
          includes: steps.map(v => v.c_key)
        },
        c_query_rule: {
          includes: queryRules.map(v => v.c_key)
        },
        c_branch: {
          includes: branches.map(v => v.c_key)
        },
        c_group_task: {
          includes: taskAssignments.map(v => v.c_key)
        }
      }

script.exit({ manifest })