/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-unused-vars */
const { assert, expect } = require('chai'),
      sinon = require('sinon'),
      { StudyManifestTools } = require('@medable/mdctl-axon-tools'),
      MdCtlCli = require('../../mdctl'),
      Study = require('../../tasks/study'),
      existingStudy = {
        _id: '1',
        c_name: 'Study',
        c_key: 'abc'
      },
      entities = [{
        _id: '615bcd016631cc0100d2766c',
        object: 'c_study',
        c_key: 'key-001'
      },
      {
        _id: '619aaaafe44c6e01003f7313',
        object: 'c_task',
        c_key: 'key-003'
      },
      {
        _id: '61981246ca9563010037bfa8',
        object: 'c_task',
        c_key: 'key-004'
      },
      {
        _id: '61981246ca95714c14e61a8c',
        object: 'c_step',
        c_key: 'key-005'
      },
      {
        _id: '61981246ca966caef6108f28',
        object: 'c_step',
        c_key: 'key-006'
      },
      {
        _id: '61981246ca9592ee0e41a3dd',
        object: 'ec__document_template',
        ec__key: 'key-007'
      },
      {
        _id: '61980eb292466ea32e087378',
        object: 'ec__document_template',
        ec__key: 'key-008'
      },
      {
        _id: '6d525cf2e328e7300d97c399',
        object: 'ec__default_document_css',
        c_key: 'key-009'
      },
      {
        _id: '6d525cfe328e64ac0833baef',
        object: 'ec__knowledge_check',
        c_key: 'key-010'
      },
      {
        _id: '6d525f2e328e7f1e48262523',
        object: 'ec__knowledge_check',
        c_key: 'key-011'
      },
      {
        _id: '6d525gbed28e7f1e4826bb76',
        object: 'c_visit_schedule',
        c_key: 'key-012'
      },
      {
        _id: '6d525gc1408e7f1e4826bb11',
        object: 'c_visit',
        c_key: 'key-013'
      },
      {
        _id: '6d525gbe28e7fc4ff43c310',
        object: 'c_group',
        c_key: 'key-014'
      },
      {
        _id: '67725gbe28e7f98ee3c8667',
        object: 'c_group_task',
        c_key: 'key-015'
      }],
      dummyReferences = [
        {
          name: 'c_study',
          array: false,
          object: 'c_study',
          type: 'Reference',
          required: false
        }
      ],
      org = {
        objects: {
          c_study: {
            readOne: () => ({
              execute: () => ({
                hasNext: true,
                next: existingStudy
              })
            })
          },
          c_task: {
            find: () => ({
              limit: () => ({
                toArray: () => entities.filter(e => e.object === 'c_task')
              })
            })
          },
          ec__document_template: {
            find: () => ({
              limit: () => ({
                toArray: () => entities.filter(e => e.object === 'ec__document_template')
              })
            })
          },
          object: {
            find: () => ({
              paths: () => ({
                toArray: () => [{ uniqueKey: 'c_key' }]
              })
            })
          }
        }
      }


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

describe('MIG-156 - Test eTemplate exclusion flag in study.js module', () => {
  beforeEach(() => {
    sinon.stub(MdCtlCli.prototype, 'getAuthOptions').returns({ env: 'local', endpoint: 'https://api.local.medable.com' })
    sinon.stub(MdCtlCli.prototype, 'getApiClient').returns({})
    study = new Study()
    studyManifest = new StudyManifestTools()
  })

  afterEach(() => {
    sinon.restore()
  })

  it('Test study export include templates', async() => {
    const manifestEntitiesToCompare = {
            object: 'manifest',
            dependencies: false,
            exportOwner: false,
            importOwner: false,
            c_study: {
              includes: ['key-001'],
              defer: [
                'c_public_group',
                'c_default_subject_site',
                'c_default_subject_visit_schedule',
                'c_default_subject_group',
                'c_default_participant_schedule',
                'c_menu_config.c_group_id'
              ]
            },
            c_task: { includes: ['key-003', 'key-004'] },
            c_step: { includes: ['key-005', 'key-006'] },
            c_visit_schedule: { includes: ['key-012'] },
            c_visit: { includes: ['key-013'] },
            c_group: { includes: ['key-014'] },
            c_group_task: { includes: ['key-015'] }
          },
          exportableObject = studyManifest.getAvailableObjectNames(),
          keyName = 'c_key',
          cli = new MdCtlCli()

    sinon.stub(MdCtlCli.prototype, 'getArguments').returns(({ excludeTemplates: false, manifestOnly: true }))
    sinon.stub(StudyManifestTools.prototype, 'getExportableObjects').returns(exportableObject)
    sinon.stub(StudyManifestTools.prototype, 'getExportObjects').returns([])
    sinon.stub(StudyManifestTools.prototype, 'getFirstStudy').returns(existingStudy)
    sinon.stub(StudyManifestTools.prototype, 'getMappings').callsFake(() => '')
    sinon.stub(StudyManifestTools.prototype, 'getOrgObjectInfo').callsFake(() => dummyReferences)
    sinon.stub(StudyManifestTools.prototype, 'getKeyName').callsFake(key => ((key === 'ec__document_template') ? 'ec__key' : keyName))
    sinon.stub(StudyManifestTools.prototype, 'getTaskManifestEntities').callsFake(() => entities.filter(o => ['c_task', 'c_step', 'c_branch'].includes(o.object)))
    sinon.stub(StudyManifestTools.prototype, 'getConsentManifestEntities').callsFake(() => entities.filter(o => ['ec__document_template', 'ec__default_document_css', 'ec__knowledge_check'].includes(o.object)))
    sinon.stub(StudyManifestTools.prototype, 'getObjectIDsArray').callsFake((_org, key, property, values) => entities.filter(o => o.object === key))
    sinon.stub(StudyManifestTools.prototype, 'validateReferences').callsFake(() => ({ outputEntities: entities.filter(o => !['ec__document_template', 'ec__default_document_css', 'ec__knowledge_check'].includes(o.object)), removedEntities: {} }))
    sinon.stub(StudyManifestTools.prototype, 'mapObjectNameToPlural').callsFake(key => `${key}s`)
    sinon.stub(StudyManifestTools.prototype, 'writeToDisk').callsFake(() => {})

    // eslint-disable-next-line one-var
    const res = await study['study@export'](cli)

    expect(res)
      .to.deep.equal(manifestEntitiesToCompare)

  })

  it('Test study export exclude eTemplates', async() => {
    const manifestEntitiesToCompare = {
            object: 'manifest',
            dependencies: false,
            exportOwner: false,
            importOwner: false,
            c_study: {
              includes: ['key-001'],
              defer: [
                'c_public_group',
                'c_default_subject_site',
                'c_default_subject_visit_schedule',
                'c_default_subject_group',
                'c_default_participant_schedule',
                'c_menu_config.c_group_id'
              ]
            },
            c_task: { includes: ['key-003', 'key-004'] },
            c_step: { includes: ['key-005', 'key-006'] },
            ec__document_template: { includes: ['key-007', 'key-008'] },
            ec__default_document_css: { includes: ['key-009'] },
            ec__knowledge_check: { includes: ['key-010', 'key-011'] },
            c_visit_schedule: { includes: ['key-012'] },
            c_visit: { includes: ['key-013'] },
            c_group: { includes: ['key-014'] },
            c_group_task: { includes: ['key-015'] }
          },
          exportableObject = studyManifest.getAvailableObjectNames(),
          keyName = 'c_key',
          cli = new MdCtlCli()

    sinon.stub(MdCtlCli.prototype, 'getArguments').returns(({ excludeTemplates: true, manifestOnly: true }))
    sinon.stub(StudyManifestTools.prototype, 'getExportableObjects').returns(exportableObject)
    sinon.stub(StudyManifestTools.prototype, 'getExportObjects').returns([])
    sinon.stub(StudyManifestTools.prototype, 'getFirstStudy').returns(existingStudy)
    sinon.stub(StudyManifestTools.prototype, 'getMappings').callsFake(() => '')
    sinon.stub(StudyManifestTools.prototype, 'getOrgObjectInfo').callsFake(() => dummyReferences)
    sinon.stub(StudyManifestTools.prototype, 'getKeyName').callsFake(key => ((key === 'ec__document_template') ? 'ec__key' : keyName))
    sinon.stub(StudyManifestTools.prototype, 'getTaskManifestEntities').callsFake(() => entities.filter(o => ['c_task', 'c_step', 'c_branch'].includes(o.object)))
    sinon.stub(StudyManifestTools.prototype, 'getConsentManifestEntities').callsFake(() => entities.filter(o => ['ec__document_template', 'ec__default_document_css', 'ec__knowledge_check'].includes(o.object)))
    sinon.stub(StudyManifestTools.prototype, 'getObjectIDsArray').callsFake((_org, key, property, values) => entities.filter(o => o.object === key))
    sinon.stub(StudyManifestTools.prototype, 'validateReferences').callsFake(() => ({ outputEntities: entities, removedEntities: {} }))
    sinon.stub(StudyManifestTools.prototype, 'mapObjectNameToPlural').callsFake(key => `${key}s`)
    sinon.stub(StudyManifestTools.prototype, 'writeToDisk').callsFake(() => {})

    // eslint-disable-next-line one-var
    const res = await study['study@export'](cli)

    expect(res)
      .to.deep.equal(manifestEntitiesToCompare)

  })
})
