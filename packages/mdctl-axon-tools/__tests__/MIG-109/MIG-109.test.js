/* eslint-disable import/order */

jest.mock('@medable/mdctl-api-driver', () => ({ Driver: class {} }), { virtual: true })
jest.mock('@medable/mdctl-api-driver/lib/cortex.object', () => ({ Object: class {}, Org: class {} }), { virtual: true })
jest.mock('../../lib/mappings')

const fs = require('fs'),
      StudyManifestTools = require('../../lib/StudyManifestTools')

describe('MIG-109 - Test StudyManifestTools ', () => {

  let manifestTools
  const mockGetExportedObjects = jest.fn(() => []),
        existingStudy = {
          _id: '1',
          c_name: 'Study',
          c_key: 'abc'
        },
        hasNextStudyMock = jest.fn(() => true),
        nextStudyMock = jest.fn(() => existingStudy),
        hasNextStudySchema = jest.fn(() => true),
        nextStudySchemaMock = jest.fn(() => ({ _id: '1', object: 'object', properties: [{ name: 'c_no_pii' }] })),
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
                skipAcl: () => ({
                  grant: () => ({
                    paths: () => ({
                      hasNext: hasNextStudyMock,
                      next: nextStudyMock
                    })
                  })
                })
              })
            },
            object: {
              find: () => ({
                skipAcl: () => ({
                  grant: () => ({
                    paths: () => ({
                      hasNext: hasNextStudySchema,
                      next: nextStudySchemaMock
                    })
                  })
                })
              })
            }
          }
        },
        exportableObject = ['c_task', 'c_visit'],
        keyName = 'c_key'

  beforeAll(async() => {
    manifestTools = new StudyManifestTools({})
    manifestTools.getExportObjects = mockGetExportedObjects
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Test study manifest creation', async() => {
    const manifest = {
            object: 'manifest',
            dependencies: false,
            exportOwner: false,
            importOwner: false,
            c_study: {
              includes: [
                'key-001'
              ]
            },
            c_dummy_object: {
              includes: [
                'key-002'
              ]
            },
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
          ingestTransform = fs.readFileSync(`${__dirname}/../../packageScripts/ingestTransform.js`).toString()

    jest.spyOn(StudyManifestTools.prototype, 'getExportableObjects').mockImplementation(() => exportableObject)
    jest.spyOn(StudyManifestTools.prototype, 'getKeyName').mockImplementation(() => keyName)
    jest.spyOn(StudyManifestTools.prototype, 'getFirstStudy').mockImplementation(() => org)
    jest.spyOn(StudyManifestTools.prototype, 'getOrgObjectInfo').mockImplementation(() => dummyReferences)
    jest.spyOn(StudyManifestTools.prototype, 'validateReferences').mockImplementation(() => entities)
    jest.spyOn(StudyManifestTools.prototype, 'createManifest').mockImplementation(() => manifest)
    jest.spyOn(StudyManifestTools.prototype, 'getObjectIDsArray').mockImplementation(() => entities.filter(o => o.object === 'c_task'))
    jest.spyOn(StudyManifestTools.prototype, 'mapObjectNameToPlural').mockImplementation(() => 'c_tasks')
    // eslint-disable-next-line one-var
    const manifestAndDeps = await manifestTools.buildManifestAndDependencies()

    expect(manifestAndDeps.manifest)
      .toStrictEqual(manifest)
    expect(manifestAndDeps.removedEntities)
      .toBeUndefined()
    expect(manifestAndDeps.mappingScript)
      .toBeUndefined()
    expect(manifestAndDeps.ingestTransform)
      .toStrictEqual(ingestTransform)
  })

  it('Test task manifest creation', async() => {
    const manifest = {
      object: 'manifest',
      dependencies: false,
      exportOwner: false,
      importOwner: false,
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
    }

    jest.spyOn(StudyManifestTools.prototype, 'getOrgObjectInfo').mockImplementation(() => dummyReferences)
    jest.spyOn(StudyManifestTools.prototype, 'validateReferences').mockImplementation(() => entities)
    jest.spyOn(StudyManifestTools.prototype, 'createManifest').mockImplementation(() => manifest)

    // eslint-disable-next-line one-var
    const manifestAndDeps = await manifestTools.buildTaskManifestAndDependencies(['619aaaafe44c6e01003f7313', '61981246ca9563010037bfa8'])

    expect(manifestAndDeps.manifest)
      .toStrictEqual(manifest)
    expect(manifestAndDeps.removedEntities)
      .toBeUndefined()
  })

  it('Test consent manifest creation', async() => {
    const manifest = {
      object: 'manifest',
      dependencies: false,
      exportOwner: false,
      importOwner: false,
      ec__document_template: {
        includes: [
          'key-007',
          'key-008'
        ]
      },
      ec__default_document_css: {
        includes: [
          'key-009'
        ]
      },
      ec__knowledge_check: {
        includes: [
          'key-010',
          'key-011'
        ]
      }
    }
    jest.spyOn(StudyManifestTools.prototype, 'getOrgObjectInfo').mockImplementation(() => dummyReferences)
    jest.spyOn(StudyManifestTools.prototype, 'validateReferences').mockImplementation(() => entities)
    jest.spyOn(StudyManifestTools.prototype, 'createManifest').mockImplementation(() => manifest)

    // eslint-disable-next-line one-var
    const manifestAndDeps = await manifestTools.buildConsentManifestAndDependencies(['61981246ca9592ee0e41a3dd', '61980eb292466ea32e087378'])

    expect(manifestAndDeps.manifest)
      .toStrictEqual(manifest)
    expect(manifestAndDeps.removedEntities)
      .toBeUndefined()
  })
})
