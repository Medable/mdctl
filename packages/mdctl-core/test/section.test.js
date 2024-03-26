/* eslint-disable no-underscore-dangle */
const assert = require('assert'),
      { ExportSection } = require('../streams/section')

describe('ExportSection', () => {
  let exportSection

  describe('constructor', () => {
    beforeEach(() => {
      exportSection = new ExportSection({}, 'key', [])
    })

    it('should initialize with empty scriptFiles, extraFiles, templateFiles, resourcePaths, and id', () => {
      assert.deepStrictEqual(exportSection.scriptFiles, [])
      assert.deepStrictEqual(exportSection.extraFiles, [])
      assert.deepStrictEqual(exportSection.templateFiles, [])
      assert.deepStrictEqual(exportSection.resourcePaths, [])
      assert.strictEqual(typeof exportSection.id, 'string')
    })

    it('should add itself to sectionsWithResources if it has resourceIds and sectionsWithResources is an array', () => {
      const sectionsWithResources = [],
            content = {
              resourceId: 'resource1'
            }
      exportSection = new ExportSection(content, 'key', sectionsWithResources)

      assert.strictEqual(sectionsWithResources.length, 1)
      assert.strictEqual(sectionsWithResources[0], exportSection)
    })

    it('should not add itself to sectionsWithResources if it does not have resourceIds', () => {
      const sectionsWithResources = [],
            content = {}
      exportSection = new ExportSection(content, 'key', sectionsWithResources)

      assert.strictEqual(sectionsWithResources.length, 0)
    })

    it('should not add itself to sectionsWithResources if sectionsWithResources is not an array', () => {
      const sectionsWithResources = {},
            content = {
              resourceId: 'resource1'
            }
      exportSection = new ExportSection(content, 'key', sectionsWithResources)

      assert.strictEqual(sectionsWithResources.length, undefined)
    })
  })

  describe('extractAssets', () => {
    it('should add extraFiles to the exportSection if resource is found in sectionsWithResources #CTXAPI-2569', () => {
      const chunks = [
              {
                name: 'Section 1 with resources',
                object: 'env',
                resource: 'env',
                favicon: [
                  {
                    filename: 'favicon.ico',
                    name: 'content',
                    mime: 'image/x-icon',
                    object: 'facet',
                    resourceId: 'e6bd7abd-d7b8-42af-a5d8-52666fc44943'
                  }
                ],
              },
              {
                name: 'Section 2 with resources',
                logo: [
                  {
                    filename: 'medable_logo_sm.png',
                    name: 'content',
                    mime: 'image/png',
                    object: 'facet',
                    resourceId: '1d1de797-6a1e-4d7e-a3c8-b76f4a4b4df1'
                  },
                  {
                    filename: 'medable_logo_sm.png',
                    name: 'thumbnail',
                    mime: 'image/png',
                    object: 'facet',
                    resourceId: 'adfa4f86-f6e5-4f6c-b52f-98a55ba4815f'
                  }
                ],
                object: 'env',
                resource: 'env',
              },
            ],

            sectionsWithResources = [],
            sections = []

      chunks.forEach((chunk) => {
        // eslint-disable-next-line no-new
        sections.push(new ExportSection(chunk, chunk.object, sectionsWithResources))
      })

      // eslint-disable-next-line one-var
      const facet = new ExportSection({
        ETag: '2dd97d9de738211e48611dd03f2e0826',
        base64: 'base64string',
        mime: 'image/png',
        name: 'content for section 1',
        object: 'facet',
        resource: 'favicon.ico',
        resourceId: 'e6bd7abd-d7b8-42af-a5d8-52666fc44943'
      }, 'facet', sectionsWithResources)

      assert.strictEqual(facet.extraFiles.length, 0)

      facet.extractAssets()

      assert.strictEqual(facet.extraFiles.length, 1)
      assert.deepStrictEqual(facet.extraFiles[0], {
        name: 'favicon.ico',
        ext: 'png',
        url: undefined,
        base64: 'base64string',
        streamId: undefined,
        path: undefined,
        remoteLocation: false,
        sectionId: sections[0].id,
        sectionName: sections[0].name,
        pathTo: '$.favicon[0].filePath',
        ETag: '2dd97d9de738211e48611dd03f2e0826',
        PathETag: '$.favicon[0].ETag'
      })
    })

  })
})
