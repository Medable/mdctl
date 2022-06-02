/* eslint-disable import/order */

jest.mock('@medable/mdctl-core-utils/privates', () => ({ privatesAccessor: () => ({ options: { dir: __dirname } }) }), { virtual: true })
jest.mock('runtime.transform', () => ({ Transform: class {} }), { virtual: true })
jest.mock('@medable/mdctl-api-driver', () => ({ Driver: class {} }), { virtual: true })
jest.mock('@medable/mdctl-api-driver/lib/cortex.object', () => ({ Object: class {}, Org: class {} }), { virtual: true })

// eslint-disable-next-line import/no-dynamic-require
const StudyManifestTools = require('../../lib/StudyManifestTools')

describe('getStudyManifestEntities', () => {

  let manifestTools
  const mockGetExportedObjects = jest.fn(() => [])

  beforeAll(async() => {
    manifestTools = new StudyManifestTools({})
    manifestTools.getExportObjects = mockGetExportedObjects
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    ['c_sites'],
    ['c_anchor_date_templates'],
    ['c_looker_integration_records'],
    ['int__vendor_integration_records'],
    ['int__model_mappings'],
    ['int__pipelines'],
    ['orac__studies'],
    ['orac__sites'],
    ['orac__forms'],
    ['orac__form_questions'],
    ['orac__events']
  ])('should include %s', async(entity) => {
    jest.spyOn(StudyManifestTools.prototype, 'getObjectIDsArray').mockImplementation(() => [1])
    jest.spyOn(StudyManifestTools.prototype, 'mapObjectNameToPlural').mockImplementation(() => entity)
    const entities = await manifestTools.getStudyManifestEntities({}, {}, {}),
          objectsRequested = mockGetExportedObjects
            .mock
            .calls
            .map(([, objectRequested]) => objectRequested)

    expect(objectsRequested)
      .toContain(entity)
  })

})
