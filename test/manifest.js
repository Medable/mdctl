
const _ = require('lodash'),
      { assert } = require('chai'),
      { throwIf, tryCatch } = require('../src/utils'),
      { isSet } = require('../src/utils/values'),
      { privatesAccessor } = require('../src/utils/privates'),
      Manifest = require('../src/cli/lib/manifest'),

      shouldGetNoErrorMsg = 'err should not exist',
      shouldBeSuccessfulMsg = 'manifest creation should have been successful'

describe('Manifest.constructor', () => {

  it('should create properly without args', () => {

    // try creating the manifest
    const [err, manifest] = tryCatch(() => new Manifest())

    assert(!isSet(err), shouldGetNoErrorMsg)
    assert(isSet(manifest), shouldBeSuccessfulMsg)

    const defaultIncludes = privatesAccessor(manifest, 'includes')
    assert(isSet(defaultIncludes), 'should have default global include')
    assert(defaultIncludes[0].localeCompare('*') === 0, 'default includes should be an array')

    const defaultExcludes = privatesAccessor(manifest, 'excludes')
    assert(isSet(defaultExcludes), 'should have default excludes set')
    assert(_.isArray(defaultExcludes), 'default excludes should be an array')
    assert(defaultExcludes.length === 0, 'default excludes should be empty')

  })

  it('should create properly with null parameter', () => {

    const jsonManifest = null,
          // try creating the manifest
          [err, manifest] = tryCatch(() => new Manifest(jsonManifest))

    assert(!isSet(err), shouldGetNoErrorMsg)
    assert(isSet(manifest), shouldBeSuccessfulMsg)

    const defaultIncludes = privatesAccessor(manifest, 'includes')
    assert(isSet(defaultIncludes), 'should have default global include')
    assert(defaultIncludes[0].localeCompare('*') === 0, 'default includes should be an array')

    const defaultExcludes = privatesAccessor(manifest, 'excludes')
    assert(isSet(defaultExcludes), 'should have default excludes set')
    assert(_.isArray(defaultExcludes), 'default excludes should be an array')
    assert(defaultExcludes.length === 0, 'default excludes should be empty')
  })

  it('should create properly with empty object parameter', () => {

    const jsonManifest = {},
          // try creating the manifest
          [err, manifest] = tryCatch(() => new Manifest(jsonManifest))

    assert(!isSet(err), shouldGetNoErrorMsg)
    assert(isSet(manifest), shouldBeSuccessfulMsg)

    const defaultIncludes = privatesAccessor(manifest, 'includes')
    assert(isSet(defaultIncludes), 'should have default global include')
    assert(defaultIncludes[0].localeCompare('*') === 0, 'default includes should be an array')

    const defaultExcludes = privatesAccessor(manifest, 'excludes')
    assert(isSet(defaultExcludes), 'should have default excludes set')
    assert(_.isArray(defaultExcludes), 'default excludes should be an array')
    assert(defaultExcludes.length === 0, 'default excludes should be empty')
  })





})
