import logger from 'logger'
const { QueryStatus } = require('c_nucleus_query')

const { c_response: response } = script.arguments.new,
      { c_status: currentStatus } = script.arguments.old

if (response && currentStatus === QueryStatus.Open) {
  script.arguments.new.update('c_status', QueryStatus.Responded, { grant: consts.accessLevels.update })
  script.arguments.new.update('c_responded_by', script.principal._id, { grant: consts.accessLevels.update })
  script.arguments.new.update('c_responded_datetime', new Date().toISOString(), { grant: consts.accessLevels.update })
}