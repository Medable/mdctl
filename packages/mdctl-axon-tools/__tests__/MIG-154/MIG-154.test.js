describe('MIG-154 - Check new methods', () => {

  beforeEach(() => {
    /*
      Resets the module registry - the cache of all required modules
      Needed to isolate modules where local state might conflict between
      tests (privateAccessor in this case)
    */
    jest.resetModules()
  })

  it('Test getExportableObjects', async() => {
    const orgObjects = [
      {
        name: 'c_fault',
        uniqueKey: 'c_key'
      },
      {
        name: 'c_group',
        uniqueKey: 'c_key'
      },
      {
        name: 'c_task',
        uniqueKey: 'c_key'
      },
      {
        name: 'c_visit',
        uniqueKey: ''
      }
    ]

    jest.mock('@medable/mdctl-core-utils/privates', () => ({ privatesAccessor: () => ({ orgObjects }) }))
    // eslint-disable-next-line global-require
    const StudyManifestTools = require('../../lib/StudyManifestTools'),
          manifestTools = new StudyManifestTools({}),
          exportableObjects = await manifestTools.getExportableObjects(),
          expectedObject = orgObjects.filter(({ uniqueKey }) => uniqueKey && uniqueKey !== 'mig__key').map(({ name }) => name)

    expect(exportableObjects)
      .toStrictEqual(expectedObject)
  })

  it('Test getKeyName', async() => {
    const orgObjects = [
      {
        name: 'c_fault',
        uniqueKey: 'c_key'
      },
      {
        name: 'c_group',
        uniqueKey: 'c_key'
      },
      {
        name: 'c_task',
        uniqueKey: 'c_key'
      },
      {
        name: 'c_visit',
        uniqueKey: ''
      }
    ]

    jest.mock('@medable/mdctl-core-utils/privates', () => ({ privatesAccessor: () => ({ orgObjects }) }))
    // eslint-disable-next-line global-require
    const StudyManifestTools = require('../../lib/StudyManifestTools'),
          manifestTools = new StudyManifestTools({}),
          key = 'c_task',
          keyName = await manifestTools.getKeyName(key)

    expect(keyName)
      .toBe('c_key')
  })

})
