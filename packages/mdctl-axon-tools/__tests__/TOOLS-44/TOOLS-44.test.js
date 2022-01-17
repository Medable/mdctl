/* eslint-disable import/order */
// eslint-disable-next-line import/no-dynamic-require
const Transform = require('../../packageScripts/ingestTransform.js')

jest.mock('runtime.transform', () => ({ Transform: class {} }), { virtual: true })
jest.mock('@medable/mdctl-core-utils/privates', () => ({ privatesAccessor: () => ({ options: { dir: __dirname } }) }), { virtual: true })
jest.mock('@medable/mdctl-api-driver', () => ({ Driver: class {} }), { virtual: true })
jest.mock('@medable/mdctl-api-driver/lib/cortex.object', () => ({ Object: class {} }), { virtual: true })
jest.mock('config', () => ({ get: jest.fn() }), { virtual: true })
// eslint-disable-next-line import/no-unresolved
const { get: getConfigMock } = require('config')

describe('checkIfDependenciesAvailable', () => {

  const existingStudy = {
          _id: '1',
          c_name: 'Study',
          c_key: 'abc'
        },
        hasNextStudyMock = jest.fn(() => true),
        nextStudyMock = jest.fn(() => existingStudy),
        hasNextStudySchema = jest.fn(() => true),
        nextStudySchemaMock = jest.fn(() => ({ _id: '1', object: 'object', properties: [{ name: 'c_no_pii' }] }))

  global.org = {
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

  global.Fault = {
    create(errCode, config) {
      return {
        errCode,
        ...config
      }
    }
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    // testCase, object, error
    ['prevent', 'ec__some_object', 'Target environment has not installed eConsent, please install eConsent and try again'],
    ['allow', 'ec__some_object', null],
    ['prevent', 'tv__some_object', 'Target environment has not installed Televisit, please install Televisit and try again'],
    ['allow', 'tv__some_object', null],
    ['prevent', 'int__some_object', 'Target environment has not installed Integrations, please install Integrations and try again'],
    ['allow', 'int__some_object', null],
    ['prevent', 'orac__some_object', 'Target environment has not installed Oracle Integration, please install Oracle Integration and try again'],
    ['allow', 'orac__some_object', null],
  ])('should %s installation of %s', (testCase, object, error) => {

    const version = testCase === 'prevent' ? '' : '1.0'

    getConfigMock.mockImplementation(() => version)

    // eslint-disable-next-line one-var
    const transform = new Transform(),

          resource = {
            object
          },
          memo = {}

    transform.beforeAll(memo)

    let fault,
        response

    try {
      response = transform.each(resource, memo)
    } catch (err) {
      fault = err
    }

    if (testCase === 'prevent') {
      expect(fault.reason)
        .toEqual(error)
    } else {
      expect(fault)
        .toBeUndefined()

      expect(response)
        .toEqual(resource)
    }

  })
})
