// const objects = require('objects');
import faults from 'c_fault_lib'
const request = require('request')

if (!request.query.studyId) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}
const studyId = request.query.studyId

let result = null

const groups = org.objects.c_group
  .aggregate()
  .skipAcl(true)
  .match({ 'c_study': studyId })
  .map(g => g._id)

const count = org.objects.accounts
  .aggregate()
  .skipAcl(true)
  .grant(7)
  .match({ 'c_study_groups': { '$in': groups } })
  .group({ '_id': null, 'count': { '$count': '_id' } })
  .map(x => x.count)

if (count.length === 0) {
  throw new Error('Something went wrong')
}

return count[0]