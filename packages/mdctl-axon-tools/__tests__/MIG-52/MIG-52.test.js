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

describe('checkIfAppsAvailable', () => {

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

  it('should prevent importing a c_study with privacy items with c_apps empty', () => {

    getConfigMock.mockImplementation(() => '')

    const transform = new Transform(),

          resource = {
            _id: '1',
            c_name: 'Study',
            c_privacy_items: [{
              c_apps: [],
              c_label: 'Privacy Item'
            }],
            c_key: 'abc',
            object: 'c_study'
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
      .toEqual("The Study imported has a privacy item called: 'Privacy Item' without an app assigned, assign an app, export and try again")
  })

  it('should allow importing a c_study with privacy items with c_apps not empty', () => {

    getConfigMock.mockImplementation(() => '')

    const transform = new Transform(),

          resource = {
            _id: '1',
            c_name: 'Study',
            c_privacy_items: [{
              c_apps: [
                'c_random_app'
              ],
              c_label: 'Privacy Item'
            }],
            c_key: 'abc',
            object: 'c_study'
          },
          memo = {}

    transform.beforeAll(memo)

    // eslint-disable-next-line one-var
    const res = transform.each(resource, memo)

    expect(res)
      .toStrictEqual(resource)
  })


})
