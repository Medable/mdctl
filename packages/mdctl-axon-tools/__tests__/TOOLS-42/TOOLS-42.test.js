// eslint-disable-next-line import/no-dynamic-require
const Transform = require(`${__dirname}/../../packageScripts/ingestTransform.js`)

jest.mock('runtime.transform', () => ({ Transform: class {} }), { virtual: true })

describe('ingestTransform', () => {

  const existingStudy = {
    _id: '1',
    c_name: 'Study',
    c_key: 'abc'
  }

  describe('before', () => {

    const hasNextMock = jest.fn(() => true),
          nextMock = jest.fn(() => existingStudy)

    global.org = {
      objects: {
        c_study: {
          find: () => ({
            skipAcl: () => ({
              grant: () => ({
                paths: () => ({
                  hasNext: hasNextMock,
                  next: nextMock
                })
              })
            })
          })
        }
      }
    }

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

    it.each([
      // test, resource, memo, expected
      ['should perform studyReferenceAdjustment', { object: 'c_some_object', c_study: '' }, { study: { c_key: 'abc' } }, { object: 'c_some_object', c_study: 'c_study.abc' }],
      ['should perform studyAdjustments and add c_no_pii to false if it does not exist', { object: 'c_study' }, {}, { object: 'c_study', c_no_pii: false }],
      ['should perform studyAdjustments and preserve c_no_pii if it does exist', { object: 'c_study', c_no_pii: true }, {}, { object: 'c_study', c_no_pii: true }],
      ['should perform econsentDocumentTemplateAdjustments', { object: 'ec__document_template', ec__published: true, ec__status: 'random' }, {}, { object: 'ec__document_template', ec__status: 'draft', c_sites: [] }]
    ])('%s', (test, resource, memo, expected) => {
      const transformedResource = transform.each(resource, memo)

      expect(transformedResource)
        .toEqual(expected)
    })
  })


})
