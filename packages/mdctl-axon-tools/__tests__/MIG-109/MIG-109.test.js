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
        }],
        dummyReferences = [
          {
            name: 'c_study',
            array: false,
            object: 'c_study',
            type: 'Reference',
            required: false
          },
          {
            name: 'c_visits',
            array: true,
            object: 'c_visit',
            type: 'ObjectId',
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
        manifest = {
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
          }
        }

  beforeAll(async() => {
    manifestTools = new StudyManifestTools({})
    manifestTools.getExportObjects = mockGetExportedObjects
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Test buildManifestAndDependencies function', async() => {
    jest.spyOn(StudyManifestTools.prototype, 'getOneStudy').mockImplementation(() => org)
    jest.spyOn(StudyManifestTools.prototype, 'getOrgObjectInfo').mockImplementation(() => dummyReferences)
    jest.spyOn(StudyManifestTools.prototype, 'validateReferences').mockImplementation(() => entities)
    jest.spyOn(StudyManifestTools.prototype, 'createManifest').mockImplementation(() => manifest)

    const ingestTransform = fs.readFileSync(`${__dirname}/../../packageScripts/ingestTransform.js`).toString(),
          manifestAndDeps = await manifestTools.buildManifestAndDependencies()

    expect(manifestAndDeps.manifest)
      .toStrictEqual(manifest)
    expect(manifestAndDeps.removedEntities)
      .toBeUndefined()
    expect(manifestAndDeps.mappingScript)
      .toBeUndefined()
    expect(manifestAndDeps.ingestTransform)
      .toStrictEqual(ingestTransform)
  })
})
