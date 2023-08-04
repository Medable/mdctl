/* eslint-disable import/order */

jest.mock('@medable/mdctl-api-driver', () => ({ Driver: class {} }), { virtual: true })
jest.mock('@medable/mdctl-api-driver/lib/cortex.object', () => ({ Object: class {}, Org: class {} }), { virtual: true })
jest.mock('../../lib/mappings')

const fs = require('fs'),
      StudyManifestTools = require('../../lib/StudyManifestTools')

describe('MIG-156 - Test eTemplate exclusion in StudyManifestTools', () => {

  let manifestTools
  const mockGetExportedObjects = jest.fn(() => []),
        existingStudy = {
          _id: '1',
          c_name: 'Study',
          c_key: 'abc'
        },
        hasNextStudyMock = jest.fn(() => true),
        nextStudyMock = jest.fn(() => existingStudy),
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
            c_study: {
              readOne: () => ({
                execute: () => ({
                  hasNext: hasNextStudyMock,
                  next: nextStudyMock
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

  beforeAll(async() => {
    manifestTools = new StudyManifestTools({})
    manifestTools.getExportObjects = mockGetExportedObjects
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Test eTemplates not excluded from manifest', async() => {
    const manifestEntitiesToCompare = [
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
            }
          ],
          exportableObject = manifestTools.getAvailableObjectNames(),
          keyName = 'c_key'

    jest.spyOn(StudyManifestTools.prototype, 'getExportableObjects').mockImplementation(() => exportableObject)
    jest.spyOn(StudyManifestTools.prototype, 'getKeyName').mockImplementation(key => ((key === 'ec__document_template') ? 'ec__key' : keyName))
    jest.spyOn(StudyManifestTools.prototype, 'getTaskManifestEntities').mockImplementation(() => entities.filter(o => ['c_task', 'c_step', 'c_branch'].includes(o.object)))
    jest.spyOn(StudyManifestTools.prototype, 'getConsentManifestEntities').mockImplementation(() => entities.filter(o => ['ec__document_template', 'ec__default_document_css', 'ec__knowledge_check'].includes(o.object)))
    jest.spyOn(StudyManifestTools.prototype, 'getObjectIDsArray').mockImplementation(key => entities.filter(o => o.object === key))
    jest.spyOn(StudyManifestTools.prototype, 'mapObjectNameToPlural').mockImplementation(key => `${key}s`)
    jest.spyOn(StudyManifestTools.prototype, 'getAllObjectIDsArray').mockImplementation(key => entities.filter(o => o.object === key).map(e => e._id))
    jest.spyOn(StudyManifestTools.prototype, 'isWorkflowSupported').mockImplementation(() => true)
    jest.spyOn(StudyManifestTools.prototype, 'getWorkflowManifestEntities').mockImplementation(() => [])
    // eslint-disable-next-line one-var, max-len
    const manifestEntities = await manifestTools.getStudyManifestEntities(org, existingStudy, {}, dummyReferences, false)

    expect(manifestEntities)
      .toStrictEqual(manifestEntitiesToCompare)
  })

  it('Test eTemplates excluded from manifest', async() => {
    const manifestEntitiesToCompare = [
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
            }
          ],
          exportableObject = manifestTools.getAvailableObjectNames(),
          keyName = 'c_key'

    jest.spyOn(StudyManifestTools.prototype, 'getExportableObjects').mockImplementation(() => exportableObject)
    jest.spyOn(StudyManifestTools.prototype, 'getKeyName').mockImplementation(key => ((key === 'ec__document_template') ? 'ec__key' : keyName))
    jest.spyOn(StudyManifestTools.prototype, 'getTaskManifestEntities').mockImplementation(() => entities.filter(o => ['c_task', 'c_step', 'c_branch'].includes(o.object)))
    jest.spyOn(StudyManifestTools.prototype, 'getConsentManifestEntities').mockImplementation(() => entities.filter(o => ['ec__document_template', 'ec__default_document_css', 'ec__knowledge_check'].includes(o.object)))
    jest.spyOn(StudyManifestTools.prototype, 'getObjectIDsArray').mockImplementation(key => entities.filter(o => o.object === key))
    jest.spyOn(StudyManifestTools.prototype, 'mapObjectNameToPlural').mockImplementation(key => `${key}s`)
    jest.spyOn(StudyManifestTools.prototype, 'getAllObjectIDsArray').mockImplementation(key => entities.filter(o => o.object === key).map(e => e._id))
    jest.spyOn(StudyManifestTools.prototype, 'isWorkflowSupported').mockImplementation(() => true)
    jest.spyOn(StudyManifestTools.prototype, 'getWorkflowManifestEntities').mockImplementation(() => [])
    // eslint-disable-next-line one-var, max-len
    const manifestEntities = await manifestTools.getStudyManifestEntities(org, existingStudy, {}, dummyReferences, true)

    expect(manifestEntities)
      .toStrictEqual(manifestEntitiesToCompare)
  })

})
