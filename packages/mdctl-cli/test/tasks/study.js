// eslint-disable-next-line import/no-extraneous-dependencies
const { assert, expect } = require('chai'),
      { StudyManifestTools } = require('@medable/mdctl-axon-tools'),
      Study = require('../../tasks/study')

let study,
    studyManifest

describe('MIG-85 - Test partial migrations in study.js module', () => {
  before(() => {
    study = new Study()
    studyManifest = new StudyManifestTools()
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

  it('Test validateManifest function - Invalid manifest', () => {
    const manifest = `{
            "c_group_task": {
              "includes": [
                "key-002"
              ]
            }
          }`

    let res
    try {
      res = study.validateManifest(manifest, studyManifest.getAvailableObjectNames())
    } catch (err) {
      res = err
    }

    assert
      .equal(res.errCode, 'mdctl.invalidArgument.unspecified')
    assert
      .equal(res.code, 'kInvalidArgument')
    assert
      .equal(res.reason, 'Invalid manifest. Please make sure it contains the right key/value ("object": "manifest")')
  })

  it('Test validateManifest function - No entities to export', () => {
    const manifest = `{
      "object": "manifest",
      "c_step": {
        "includes": [
          "key-014"
        ]
      },
      "c_group_task": {
        "includes": [
          "key-015"
        ]
      }
    }`

    let res
    try {
      res = study.validateManifest(manifest, studyManifest.getAvailableObjectNames())
    } catch (err) {
      res = err
    }

    assert
      .equal(res.errCode, 'mdctl.invalidArgument.unspecified')
    assert
      .equal(res.code, 'kInvalidArgument')
    assert
      .equal(res.reason, 'Nothing to export')

  })

  it('Test validateManifest function - Removed not allowed entities', () => {
    const manifest = `{
            "object": "manifest",
            "c_task": {
              "includes": [
                "key-001"
              ]
            },
            "c_group_task": {
              "includes": [
                "key-002"
              ]
            }
          }`,
          res = study.validateManifest(manifest, studyManifest.getAvailableObjectNames())

    expect(res)
      .to.deep.equal({
        object: 'manifest',
        c_task: {
          includes: [
            'key-001'
          ]
        }
      })

  })

})
