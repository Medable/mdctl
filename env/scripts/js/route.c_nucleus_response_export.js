import request from 'request'

const { c_step_responses: sr, c_public_users, c_sites } = org.objects,
      from = request.query.from || '2000-01-01T00:00:00.000Z',
      to = request.query.to || '2999-12-31T23:59:59.999Z',
      subjects = request.query.subjects && request.query.subjects.split(',') || [],
      match = {c_study: '5a54f7df392fc401009a82c9', created: {$gte: from, $lte: to}},
      subjectIds = c_public_users.find({c_number: {$in: subjects}}).skipAcl().grant(4).paths(['_id','c_number']).map(s => s._id),
      paths = [
        'c_value',
        'creator.c_public_identifier',
        'created',
        'updated',
        'c_public_user.c_number',
        'c_public_user.c_type',
        'c_public_user.c_visit_schedule.c_name',
        'c_public_user.created',
        'c_step.c_mappings',
        'c_step.c_mappings.c_cdash',
        'c_step.c_mappings.c_domain',
        'c_step.c_mappings.c_category',
        'c_step.c_name',
        'c_step.c_parent_step._id',
        'c_step.c_order',
        'c_step.c_text',
        'c_step.c_type',
        'c_study.c_name',
        'c_study.c_protocol_number',
        'c_task.c_code',
        'c_task.c_name',
        'c_task.c_type',
        'c_task_response.creator.c_public_identifier',
        'c_task_response.created',
        'c_task_response.updated',
        'c_task_response.c_completed',
        'c_task_response.c_group.c_name',
        'c_task_response.c_group.c_otsuka_visit_sequence',
        'c_task_response.c_number',
        'c_task_response.c_site.c_name',
        'c_task_response.c_site.c_number',
        'c_visit.c_name'
      ]
      
if (Array.isArray(subjectIds) && subjectIds.length) {
    match.c_public_user = {$in: subjectIds}
}

return sr.find(match)
         .paths(paths)
         .passive()
         .skipAcl()
         .grant(4)
         .passthru()