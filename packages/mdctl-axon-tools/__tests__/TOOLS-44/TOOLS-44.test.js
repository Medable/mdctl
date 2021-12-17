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

describe('checkIfDependenciesAvailabe', () => {

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

  it('should prevent installation of ec__ objects if eConsent is not enabled', () => {

    getConfigMock.mockImplementation(() => '')

    const transform = new Transform(),

          resource = {
            object: 'ec__some_object'
          },
          memo = {}

    transform.beforeAll(memo)

    let fault

    try {
      transform.each(resource, memo)
    } catch (err) {
      fault = err
    }

    expect(fault.reason)
      .toEqual('Target environment has not installed eConsent, please install eConsent and try again')
  })

  it('should allow installation of tv__ objects if Televisit is enabled', () => {
    getConfigMock.mockImplementation(() => '1.0')

    const transform = new Transform(),

          resource = {
            object: 'tv__some_object'
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

    expect(fault)
      .toBeUndefined()

    expect(response)
      .toEqual(resource)
  })


})
