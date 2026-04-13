const { transform } = require('decorators-transform'),
  request = require('request'), { debug } = require('logger'),
  config = require('config')

const { exclusions } = config('c_cs_dmweb_config')

@transform
class Transformer {

  error(err) {
    throw err
  }

  each(report) {
    return this.filterReports(report)
  }

  filterReports(report) {
    const reportKey = getKeyById(report._id, 'c_dmweb_reports')

    if (exclusions.some(r => r === reportKey)) {
      return undefined
    }

    return report
  }

}

function getKeyById(_id, type) {
  const { c_key } = org.objects[type].readOne({ _id })
    .throwNotFound(false)
    .paths('c_key')
    .execute()

  return c_key
}

module.exports = Transformer
 
