
const { assert } = require('chai'),
      { throwIf, tryCatch } = require('../src/lib/utils'),
      { isSet } = require('../src/lib/utils/values')

describe('Utils', () => {

  it('should throwIf expression is false', () => {

    let [err] = tryCatch(() => {
      throwIf('expect an error', true)
    })
    assert(isSet(err), 'err should exist');

    [err] = tryCatch(() => {
      throwIf('do not expect an error', false)
    })
    assert(!isSet(err), 'err should not exist')

  })

})
