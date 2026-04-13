import faults from 'c_fault_lib'

const request = require('request')
const objects = require('objects')

if (!request.query.studyId) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}
const studyId = request.query.studyId

/* const result = org.objects.c_task_response
    .aggregate()
    .skipAcl(true)
    .match({c_study: studyId})
    .project({"_id":1, "yd": {"y":{"$year": "created"}, "d": {"$dayOfYear": "created"}}})
    .group({"_id": "yd", "date_yoyo":{"$first": "yd"}, "count": {"$count": "_id"}})
    .toList();

*/
return org.objects.c_task_response
  .aggregate()
  .skipAcl(true)
  .group({
    _id: {
      y: { $year: 'created' },
      d: { $dayOfYear: 'created' }
    },
    count: { $sum: 1 }
  })
  .project({
    yd: {
      y: '_id.y',
      d: '_id.d'
    },
    count: 1

  })
  .toList()