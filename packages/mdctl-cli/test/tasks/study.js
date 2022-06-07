// eslint-disable-next-line import/no-extraneous-dependencies
const { assert, expect } = require('chai'),
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

  it('Test validateManifest function - No entities to export', () => {
    const manifest = `{
      "object": "manifest",
      "c_group": {
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
      res = study.validateManifest(manifest)
    } catch (err) {
      res = err
    }

    assert
      .equal(res.errCode, 'mdctl.invalidArgument.unspecified')
    assert
      .equal(res.code, 'kInvalidArgument')
    assert
      .equal(res.reason, 'No Assignments or eConsents to export')

  })

  it('Test validateManifest function - Removed entities other than Assignments and eConsents', () => {
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
          res = study.validateManifest(manifest)

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
