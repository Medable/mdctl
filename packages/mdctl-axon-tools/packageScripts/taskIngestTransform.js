const { Transform } = require('runtime.transform'),
      { isSet } = require('util.values')

module.exports = class extends Transform {

  beforeAll(memo, { cursor, context }) {

    const {
      // eslint-disable-next-line camelcase
      org: { objects: { c_study } }
    } = global

    // eslint-disable-next-line no-param-reassign
    memo.study = c_study.find().skipAcl().grant('public').paths('_id', 'c_name', 'c_key')
      .next()
  }

  each(resource, memo, { context }) {

    if (resource.c_study) {
      // eslint-disable-next-line no-param-reassign
      resource.c_study = `c_study.${memo.study.c_key}`
    }

    return resource

  }

}
