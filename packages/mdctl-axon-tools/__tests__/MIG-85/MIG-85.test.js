/* eslint-disable import/order */

jest.mock('@medable/mdctl-api-driver', () => ({ Driver: class {} }), { virtual: true })
jest.mock('@medable/mdctl-api-driver/lib/cortex.object', () => ({ Object: class {}, Org: class {} }), { virtual: true })
jest.mock('../../lib/mappings')

const fs = require('fs'),
      StudyManifestTools = require('../../lib/StudyManifestTools')

describe('MIG-85 - Test partial migrations in StudyManifestTools', () => {

  let manifestTools
  const mockGetExportedObjects = jest.fn(() => []),
        entities = [{
          _id: '615bcd016631cc0100d2766c',
          object: 'c_study',
          c_key: 'key-001'
        },
        {
          _id: '615b60d1bf2e4301008f4d68',
          object: 'c_dummy_object',
          c_key: 'key-002'
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
          c_key: 'key-007'
        },
        {
          _id: '61980eb292466ea32e087378',
          object: 'ec__document_template',
          c_key: 'key-008'
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
            c_task: {
              find: () => ({
                limit: () => ({
                  toArray: () => entities.filter(e => e.object === 'c_task')
                })
              })
            }
          }
        }

  beforeAll(async() => {
    manifestTools = new StudyManifestTools({})
    manifestTools.getExportObjects = mockGetExportedObjects
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Test visit schedules manifest creation', async() => {
    const manifest = {
      object: 'manifest',
      dependencies: false,
      exportOwner: false,
      importOwner: false,
      c_visit_schedule: {
        includes: [
          'key-012'
        ]
      },
      c_visit: {
        includes: [
          'key-013'
        ]
      }
    }

    jest.spyOn(StudyManifestTools.prototype, 'getOrgObjectInfo').mockImplementation(() => dummyReferences)
    jest.spyOn(StudyManifestTools.prototype, 'validateReferences').mockImplementation(() => entities)
    jest.spyOn(StudyManifestTools.prototype, 'createManifest').mockImplementation(() => manifest)

    // eslint-disable-next-line one-var
    const manifestAndDeps = await manifestTools.buildVisitManifestAndDependencies(['6d525gbev28e7f1e4826bb76', '6d525g12328e7f1e4826bb11'])

    expect(manifestAndDeps.manifest)
      .toStrictEqual(manifest)
    expect(manifestAndDeps.removedEntities)
      .toBeUndefined()
  })

  it('Test groups manifest creation', async() => {
    const manifest = {
      object: 'manifest',
      dependencies: false,
      exportOwner: false,
      importOwner: false,
      c_group: {
        includes: [
          'key-014'
        ]
      },
      c_group_task: {
        includes: [
          'key-015'
        ]
      }
    }
    jest.spyOn(StudyManifestTools.prototype, 'getOrgObjectInfo').mockImplementation(() => dummyReferences)
    jest.spyOn(StudyManifestTools.prototype, 'validateReferences').mockImplementation(() => entities)
    jest.spyOn(StudyManifestTools.prototype, 'createManifest').mockImplementation(() => manifest)

    // eslint-disable-next-line one-var
    const manifestAndDeps = await manifestTools.buildGroupManifestAndDependencies(['6d525gbe28e7fc4ff43c310', '67725gbe28e7f98ee3c8667'])

    expect(manifestAndDeps.manifest)
      .toStrictEqual(manifest)
    expect(manifestAndDeps.removedEntities)
      .toBeUndefined()
  })

  it('Test loadManifest function - Invalid manifest', async() => {
    const manifest = `{
      "object": "something",
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
      res = manifestTools.loadManifest(manifest)
    } catch (err) {
      res = err
    }

    expect(res.errCode)
      .toBe('mdctl.invalidArgument.unspecified')
    expect(res.code)
      .toBe('kInvalidArgument')
    expect(res.reason)
      .toBe('The argument is not a valid manifest')
  })

  it('Test loadManifest function - Invalid file path', async() => {
    const manifest = `${__dirname}/wrongPath.json`

    let res
    try {
      res = manifestTools.loadManifest(manifest)
    } catch (err) {
      res = err
    }

    expect(res.errCode)
      .toBe('mdctl.invalidArgument.unspecified')
    expect(res.code)
      .toBe('kInvalidArgument')
    expect(res.reason)
      .toBe('The manifest file does not exists')
  })

  it('Test loadManifest function - Invalid JSON file', async() => {
    const manifest = `${__dirname}/wrongManifest.json`

    let res
    try {
      res = manifestTools.loadManifest(manifest)
    } catch (err) {
      res = err
    }

    expect(res.errCode)
      .toBe('mdctl.invalidArgument.unspecified')
    expect(res.code)
      .toBe('kInvalidArgument')
    expect(res.reason)
      .toBe('The manifest file is not a valid JSON')
  })

  it('Test study manifest creation from manifest', async() => {
    const manifest = {
            object: 'manifest',
            c_task: {
              includes: [
                'key-003',
                'key-004'
              ]
            },
            c_step: {
              includes: [
                'key-005',
                'key-006'
              ]
            }
          },
          ingestTransform = fs.readFileSync(`${__dirname}/../../packageScripts/ingestTransform.js`).toString(),
          stringifiedManifest = JSON.stringify(manifest)

    jest.spyOn(StudyManifestTools.prototype, 'getOrgObjectInfo').mockImplementation(() => dummyReferences)
    jest.spyOn(StudyManifestTools.prototype, 'validateReferences').mockImplementation(() => entities)
    jest.spyOn(StudyManifestTools.prototype, 'createManifest').mockImplementation(() => manifest)
    jest.spyOn(StudyManifestTools.prototype, 'getObjectIDsArray').mockImplementation(() => entities.filter(o => o.object === 'c_task'))
    jest.spyOn(StudyManifestTools.prototype, 'mapObjectNameToPlural').mockImplementation(() => 'c_tasks')
    // eslint-disable-next-line one-var
    const manifestAndDeps = await manifestTools.buildManifestAndDependencies(stringifiedManifest)

    expect(manifestAndDeps.manifest)
      .toStrictEqual(manifest)
    expect(manifestAndDeps.removedEntities)
      .toBeUndefined()
    expect(manifestAndDeps.mappingScript)
      .toBeUndefined()
    expect(manifestAndDeps.ingestTransform)
      .toStrictEqual(ingestTransform)
  })

  it('Test getObjectIDsArray function', async() => {
    const filteredEntities = entities.filter(e => e.object === 'c_task'),
          res = await manifestTools.getObjectIDsArray(org, 'c_task', 'c_key', ['key-003', 'key-004'])

    expect(res)
      .toStrictEqual(filteredEntities)
  })
})
