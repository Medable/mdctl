const {
  capitalize,
  capitalizeFirstCharacter,
  cammelToSentence,
  clone,
  isObject,
  removeExtention,
  stringify
} = require('../lib/util')

describe('capitalize', function() {

  it('should capitalize', function() {
    expect(capitalize('string')).toBe('STRING')
  })

})

describe('capitalizeFirstCharacter', function() {

  it('should capitalize first character', function() {
    expect(capitalizeFirstCharacter('string')).toBe('String')
  })

})

describe('cammelToSentence', function() {

  it('should convert cammel case to sentense case', function() {
    expect(cammelToSentence('cammelCaseString')).toBe('Cammel Case String')
  })

})

describe('clone', function() {

  it('should clone an object literal', function() {

    const object = { a: 'a' }

    expect(clone(object)).not.toBe(object)

  })

})

describe('isObject', function() {

  it('should return true for an object literal', function() {
    expect(isObject({})).toBe(true)
  })

  it('should return false for a string', function() {
    expect(isObject('string')).toBe(false)
  })

  it('should return false for a boolean', function() {
    expect(isObject(true)).toBe(false)
  })

})

describe('removeExtention', function() {

  it('should remove extention from filename', function() {
    expect(removeExtention('data.json')).toBe('data')
  })

})

describe('stringify', function() {

  it('should stringify an object literal', function() {
    expect(stringify({ a: 'a' })).toBe('{\"a\":\"a\"}')
  })

})
