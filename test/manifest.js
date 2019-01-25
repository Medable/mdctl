const _ = require('lodash'),
      { assert } = require('chai'),
      { throwIf, tryCatch } = require('../src/utils'),
      { isSet } = require('../src/utils/values'),
      { privatesAccessor } = require('../src/utils/privates'),
      { Manifest, ARegex } = require('../src/cli/lib/manifest')

describe('Augmented Regular Expression', () => {

  const testCases = [
    // unintended parameters
    { shouldMatch: false, value: 'some value' },
    { shouldMatch: false, expr: [], value: 'some value' },
    { shouldMatch: false, expr: {}, value: 'some value' },
    { shouldMatch: false, expr: 4, value: 'some value' },
    // intended parameters - strings
    { shouldMatch: false, expr: '', value: 'some value' },
    { shouldMatch: false, expr: 'some string', value: 'some value' },
    { shouldMatch: true, expr: 'some value', value: 'some value' },
    { shouldMatch: true, expr: '*', value: 'some value' },
    { shouldMatch: true, expr: '*', value: '' },
    // intended patterns - regex
    { shouldMatch: true, expr: /value/, value: 'some value' },
    { shouldMatch: true, expr: '/value/', value: 'some value' },
    { shouldMatch: false, expr: '/g/', value: 'some value' }
  ]

  testCases.forEach(({ shouldMatch, expr, value }) => {
    it(`Matcher "${expr}" should ${shouldMatch ? '' : 'not '}match "${value}"`, () => {
      assert(new ARegex(expr).test(value) === shouldMatch)
    })
  })
})

describe('Manifest', () => {

  const testCases = [
    {
      description: 'The empty manifest should accept everything.',
      manifest: undefined,
      pathTests: [
        { shouldAccept: true, path: 'env.configuration.someFlag' },
        { shouldAccept: true, path: 'objects.c_obj_name.properties.c_some_prop' },
        { shouldAccept: true, path: 'templates.c_some_code' },
        { shouldAccept: true, path: 'scripts.c_some_other_code' }
      ]
    },
    {
      description: 'Global includes and excludes',
      manifest: {
        includes: ['*'],
        excludes: ['/^c_ugly/']
      },
      pathTests: [
        { shouldAccept: true, path: 'objects.anything.anything' },
        { shouldAccept: false, path: 'objects.c_obj_name.properties.c_ugly_prop' },
        { shouldAccept: false, path: 'scripts.c_ugly_script' }
      ]
    },
    {
      description: 'Mixed level includes and excludes',
      manifest: {
        includes: ['*'],
        objects: [
          {
            // Matches only pretty foo
            name: '/^c(?<!_ugly)_foo/'
            // implicit include * for props
          }
        ]
      },
      pathTests: [
        { shouldAccept: true, path: 'env.configuration.minPasswordScore' },
        { shouldAccept: true, path: 'objects.c_foo' },
        { shouldAccept: false, path: 'objects.c_ugly_foo' }
      ]
    }
  ]

  // Run test cases
  testCases.forEach((test, index) => {
    it(`Test manifest ${index}: ${test.description}`, () => {
      const [_, manifest] = tryCatch(() => new Manifest(test.manifest))

      test.pathTests.forEach(({ shouldAccept, path }) => {
        assert(
          manifest.accept(path) === shouldAccept,
          `Test manifest ${index} should have ${shouldAccept ? '' : 'not '}accepted "${path}"`
        )
      })
    })
  })
})
