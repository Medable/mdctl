const { assert } = require('chai'),
      { tryCatch } = require('../src/lib/utils'),
      { isSet } = require('../src/lib/utils/values'),
      { privatesAccessor } = require('../src/lib/privates'),
      { Manifest, ARegex } = require('../src/cli/lib/manifest')

describe('Augmented Regular Expression', () => {

  it('"value" is private', () => {
    const [constructorError, expr] = tryCatch(() => new ARegex('*'))
    assert(!isSet(constructorError), 'Constructor shouldn\'t have errored.')
    assert(isSet(privatesAccessor(expr, 'value')), 'Should have "value" set.')
    assert(!isSet(expr.value), '"value" should be private.')
  })

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
    },
    {
      description: 'All-in',
      manifest: {
        includes: ['*'],
        objects: [
          {
            // Matches only pretty foo
            name: '/^c(?<!_ugly)_foo/',
            includes: ['/blue/', 'defaultAcl'],
            excludes: '/yellow/'
          }
        ],
        scripts: {
          includes: ['/yellow/', '/blue/'],
          exports: ['/magenta/']
        },
        templates: {
          excludes: ['/3/']
        },
        // implicit include *
        views: {},
        apps: {},
        roles: {},
        serviceAccounts: {},
        policies: {},
        notifications: {},
        storageLocations: {}
      },
      pathTests: [
        // accepts these objs and props
        { shouldAccept: true, path: 'objects.c_foo' },
        { shouldAccept: true, path: 'objects.c_foo.properties.c_blue' },
        { shouldAccept: true, path: 'objects.c_foo.defaultAcl' },
        { shouldAccept: false, path: 'objects.c_foo.properties.c_yellow' },
        { shouldAccept: false, path: 'objects.c_foo.properties.c_blue_and_yellow' },
        // rejects these objs and props
        { shouldAccept: false, path: 'objects.c_ugly_foo' },
        { shouldAccept: false, path: 'objects.c_ugly_foo.properties.c_blue' },
        { shouldAccept: false, path: 'objects.c_ugly_foo.properties.c_yellow' },
        { shouldAccept: false, path: 'objects.c_ugly_foo.properties.c_blue_and_yellow' },
        // scripts
        { shouldAccept: true, path: 'scripts.c_blue_route' },
        { shouldAccept: true, path: 'scripts.c_blue_lib' },
        { shouldAccept: true, path: 'scripts.c_yellow_trigger' },
        { shouldAccept: false, path: 'scripts.c_magenta_job' },
        // templates
        { shouldAccept: true, path: 'templates.axon__email1' },
        { shouldAccept: true, path: 'templates.axon__email2' },
        { shouldAccept: false, path: 'templates.axon__email3' },
        // views
        { shouldAccept: true, path: 'views.c_view1' }
      ]
    }
  ]

  // Run test cases
  testCases.forEach((test, index) => {
    it(`Test manifest ${index}: ${test.description}`, () => {
      const [constructorError, manifest] = tryCatch(() => new Manifest(test.manifest))
      assert(!isSet(constructorError), 'Constructor shouldn\'t have errored.')

      test.pathTests.forEach(({ shouldAccept, path }) => {
        assert(
          manifest.accept(path) === shouldAccept,
          `Test manifest ${index} should have ${shouldAccept ? '' : 'not '}accepted "${path}"`
        )
      })
    })
  })
})
