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

  it('should include c_sites', async() => {
    const entities = await manifestTools.getStudyManifestEntities({}, {}, {}),
          objectsRequested = mockGetExportedObjects
            .mock
            .calls
            .map(([, objectRequested]) => objectRequested)

    expect(objectsRequested)
      .toContain('c_sites')
  })

})
