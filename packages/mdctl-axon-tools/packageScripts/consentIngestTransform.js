/* eslint-disable no-param-reassign */
const { Transform } = require('runtime.transform'),
      { isSet } = require('util.values')

module.exports = class extends Transform {

  beforeAll(memo) {

    const {
      // eslint-disable-next-line camelcase
      org: { objects: { c_study } }
    } = global

    memo.study = c_study.find().skipAcl().grant('public').paths('_id', 'c_name', 'c_key')
      .next()
  }

  each(resource, memo, { context }) {

    if (resource.c_study) {
      resource.c_study = `c_study.${memo.study.c_key}`
    }

    if (resource.object === 'ec__document_template') {
      resource.c_sites = []
      if (resource.ec__published) {
        delete resource.ec__published
      }

      resource.ec__status = 'draft'
    }

    return resource

  }

}
