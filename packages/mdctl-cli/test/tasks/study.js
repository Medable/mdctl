// eslint-disable-next-line import/no-extraneous-dependencies
const { assert } = require('chai'),
      Study = require('../../tasks/study')

let study

describe('MIG-85 - Test partial migrations in study.js module', () => {
  before(() => {
    study = new Study()
  })

  it('Test validateManifest function - Invalid file path', () => {
    const manifest = `${__dirname}/wrongPath.json`

    let res
    try {
      res = study.validateManifest(manifest)
    } catch (err) {
      res = err
    }

    assert
      .equal(res.errCode, 'mdctl.invalidArgument.unspecified')
    assert
      .equal(res.code, 'kInvalidArgument')
    assert
      .equal(res.reason, 'The manifest file does not exists')
  })

  it('Test validateManifest function - Invalid JSON file', () => {
    const manifest = `${__dirname}/data/wrongManifest.json`

    let res
    try {
      res = study.validateManifest(manifest)
    } catch (err) {
      res = err
    }

    assert
      .equal(res.errCode, 'mdctl.invalidArgument.unspecified')
    assert
      .equal(res.code, 'kInvalidArgument')
    assert
      .equal(res.reason, 'The manifest is not a valid JSON')
  })

})
