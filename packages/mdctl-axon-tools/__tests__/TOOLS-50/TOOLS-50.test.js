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
    ['int__vendor'],
    ['int__pipeline'],
    ['int__task'],
    ['int__expression'],
    ['int__secret'],
    ['int__form'],
    ['int__question'],
    ['int__site']
  ])('should include %s', async(entity) => {

    const exportableObject = ['c_site'],
          keyName = 'c_key'

    jest.spyOn(StudyManifestTools.prototype, 'getExportableObjects').mockImplementation(() => exportableObject)
    jest.spyOn(StudyManifestTools.prototype, 'getKeyName').mockImplementation(() => keyName)
    jest.spyOn(StudyManifestTools.prototype, 'getObjectIDsArray').mockImplementation(() => [1])
    jest.spyOn(StudyManifestTools.prototype, 'mapObjectNameToPlural').mockImplementation(() => entity)
    // eslint-disable-next-line one-var, no-unused-vars
    const entities = await manifestTools.getStudyManifestEntities({}, {}, {}),
          objectsRequested = mockGetExportedObjects
            .mock
            .calls
            .map(([, objectRequested]) => objectRequested)

    expect(objectsRequested)
      .toContain(entity)
  })

})
