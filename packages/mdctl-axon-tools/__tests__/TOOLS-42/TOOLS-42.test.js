// eslint-disable-next-line import/no-dynamic-require
const fs = require('fs')
const Transform = require('../../packageScripts/ingestTransform.js')
const StudyManifestTools = require('../../lib/StudyManifestTools')

jest.mock('runtime.transform', () => ({ Transform: class {} }), { virtual: true })
jest.mock('@medable/mdctl-core-utils/privates', () => ({ privatesAccessor: () => ({ options: { dir: __dirname } }) }), { virtual: true })
jest.mock('@medable/mdctl-api-driver', () => ({ Driver: class {} }), { virtual: true })
jest.mock('@medable/mdctl-api-driver/lib/cortex.object', () => ({ Object: class {} }), { virtual: true })
jest.mock('config', () => ({ get: jest.fn(() => '1.0') }), { virtual: true })

describe('ingestTransform', () => {

  const existingStudy = {
          _id: '1',
          c_name: 'Study',
          c_key: 'abc'
        },
        existingConsent = {
          _id: '2',
          ec__status: 'draft',
          ec__title: 'title',
          ec__key: '999-999-999'
        },
        hasNextStudyMock = jest.fn(() => true),
        nextStudyMock = jest.fn(() => existingStudy),
        hasNextStudySchema = jest.fn(() => true),
        nextStudySchemaMock = jest.fn(() => ({ _id: '1', object: 'object', properties: [{ name: 'c_no_pii' }] })),
        defaultGlobals = {
          consts: {
            accessLevels: {
              read: 4
            }
          },
          objects: {
            c_study: {
              find: () => ({
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
            ec__document_template: {
              readOne: () => ({
                skipAcl: () => ({
                  grant: () => ({
                    throwNotFound: () => ({
                      paths: () => ({
                        execute: () => existingConsent
                      })
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
        }

  describe('before', () => {


    beforeAll(() => {
      global.consts = defaultGlobals.consts
      global.org = defaultGlobals
    })


    afterEach(() => {
      jest.clearAllMocks()
    })

    it('should read available study if present', () => {
      const transform = new Transform(),
            memo = {}

      transform.before(memo)

      expect(memo.study)
        .toEqual(existingStudy)
    })

    it('should not read study if it is already present', () => {
      const transform = new Transform(),
            memo = { study: {} },
            cursor = global.org.objects.c_study.find().skipAcl().grant().paths()

      transform.before(memo)

      expect(cursor.hasNext.mock.calls.length)
        .toBe(0)

      expect(cursor.next.mock.calls.length)
        .toBe(0)
    })

  })

  describe('each', () => {

    let transform

    beforeAll(() => {
      transform = new Transform()
    })

    beforeEach(() => {
      global.org = defaultGlobals
    })

    it.each([
      // test, resource, memo, expected
      ['should perform studyReferenceAdjustment', { object: 'c_some_object', c_study: '' }, { study: { c_key: 'abc' } }, { object: 'c_some_object', c_study: 'c_study.abc' }],
      ['should perform studyAdjustments and add c_no_pii to false if it does not exist', { object: 'c_study' }, {}, { object: 'c_study', c_no_pii: false }],
      ['should perform studyAdjustments and preserve c_no_pii if it does exist', { object: 'c_study', c_no_pii: true }, {}, { object: 'c_study', c_no_pii: true }],
      ['should perform econsentDocumentTemplateAdjustments', { object: 'ec__document_template', ec__status: 'draft' }, {}, { object: 'ec__document_template', ec__status: 'draft', ec__sites: [] }],
      // eslint-disable-next-line object-curly-newline
      ['should not perform changes to manifest object', { object: 'manifest', c_study: {}, importOwner: false, exportOwner: false }, { study: { c_key: 'abc' } }, { object: 'manifest', c_study: {}, importOwner: false, exportOwner: false }]
    ])('%s', (test, resource, memo, expected) => {

      transform.beforeAll(memo)

      const transformedResource = transform.each(resource, memo)

      expect(transformedResource)
        .toStrictEqual(expected)
    })


    it('should not add c_study.c_no_pii for older versions without this property', () => {

      const noPiiStudySchemaMock = jest.fn(() => ({ _id: '1', object: 'object', properties: [{ name: 'c_some_other_prop' }] })),
            memo = {},
            resource = { object: 'c_study' },
            expectedResource = resource // no changes

      global.org.objects.object.find().skipAcl().grant().paths().next = noPiiStudySchemaMock

      transform.beforeAll(memo)

      // eslint-disable-next-line one-var
      const transformedResource = transform.each(resource, memo)

      expect(transformedResource)
        .toBe(expectedResource)
    })
  })

})

describe('StudyManifestTools', () => {

  const ingestTransform = 'ingestTransform.js',
        ingestTransformPath = `${__dirname}/${ingestTransform}`,
        packageJson = 'package.json',
        packageJsonPath = `${__dirname}/${packageJson}`

  afterEach(() => {
    if (fs.existsSync(ingestTransformPath)) {
      fs.unlinkSync(ingestTransformPath)
    }

    if (fs.existsSync(packageJsonPath)) {
      fs.unlinkSync(packageJsonPath)
    }
  })

  it.each([
    [
      'study',
      {
        object: 'package', name: 'Study export', version: '0.0.1', description: 'An export of a study', pipes: { ingest: 'ingestTransform.js' }
      }
    ],
    [
      'task',
      {
        object: 'package', name: 'Task export', version: '0.0.1', description: 'An export of task or multiple tasks', pipes: { ingest: 'ingestTransform.js' }
      }
    ],
    [
      'consent',
      {
        object: 'package', name: 'Consent export', version: '0.0.1', description: 'An export of task or multiple consent templates', pipes: { ingest: 'ingestTransform.js' }
      }
    ],
  ])('should writePackage for: %s', (packageType, expected) => {
    const studyManifestTools = new StudyManifestTools()

    studyManifestTools.writePackage(packageType)

    expect(fs.existsSync(ingestTransformPath)).toBeTruthy()
    expect(fs.existsSync(packageJsonPath)).toBeTruthy()

    // eslint-disable-next-line one-var
    const copiedPackageJson = JSON.parse(fs.readFileSync(packageJsonPath))

    expect(copiedPackageJson)
      .toStrictEqual(expected)
  })
})
