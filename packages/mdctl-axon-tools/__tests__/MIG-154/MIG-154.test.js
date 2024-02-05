const { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      StudyManifestTools = require('../../lib/StudyManifestTools')

describe('MIG-154 - Check new methods', () => {
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
        ],
        manifestTools = new StudyManifestTools()

  privatesAccessor(manifestTools).orgObjects = orgObjects


  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Test getExportableObjects', async() => {
    const exportableObjects = await manifestTools.getExportableObjects(),
          expectedObject = orgObjects.filter(({ uniqueKey }) => uniqueKey && uniqueKey !== 'mig__key').map(({ name }) => name)

    expect(exportableObjects)
      .toStrictEqual(expectedObject)
  })

  it('Test getKeyName', async() => {
    const key = 'c_task',
          keyName = await manifestTools.getKeyName(key)

    expect(keyName)
      .toBe('c_key')
  })

})
