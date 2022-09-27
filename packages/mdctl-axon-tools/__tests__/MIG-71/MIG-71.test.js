/* eslint-disable object-curly-newline */
/* eslint-disable camelcase */
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
        existingConsents = [{
          _id: '1',
          ec__status: 'draft',
          ec__title: 'title 1',
          ec__key: '11111',
          ec__identifier: '000001'
        },
        {
          _id: '2',
          ec__status: 'draft',
          ec__title: 'title MIG',
          ec__key: '22222',
          ec__identifier: '000001-22222'
        }],
        hasNextStudyMock = jest.fn(() => true),
        nextStudyMock = jest.fn(() => existingStudy),
        hasNextStudySchema = jest.fn(() => true),
        nextStudySchemaMock = jest.fn(() => ({ _id: '1', object: 'object', properties: [{ name: 'c_no_pii' }] })),
        defaultGlobals = {
          Fault: {
            create: (code, errObj) => ({ code, ...errObj })
          },
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
              readOne: ({ ec__key, ec__identifier }) => {
                if (ec__key) {
                  return {
                    skipAcl: () => ({
                      grant: () => ({
                        throwNotFound: () => ({
                          paths: () => ({
                            execute: () => existingConsents.find(v => v.ec__key === ec__key)
                          })
                        })
                      })
                    })
                  }
                } else if (ec__identifier) {
                  return {
                    skipAcl: () => ({
                      grant: () => ({
                        throwNotFound: () => ({
                          paths: () => ({
                            execute: () => existingConsents.find(v => v.ec__identifier === ec__identifier)
                          })
                        })
                      })
                    })
                  }
                }
              }
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

  describe('each', () => {

    let transform

    beforeAll(() => {
      global.consts = defaultGlobals.consts
      global.Fault = defaultGlobals.Fault
      global.org = defaultGlobals
      transform = new Transform()
    })

    beforeEach(() => {
      global.org = defaultGlobals
    })

    it.each([
      // test, resource, memo, expected
      ['Consents with same ec__key and ec__identifier should be overwritten', { object: 'ec__document_template', ec__status: 'draft', ec__key: '11111', ec__title: 'title 1 MIG', ec__identifier:  '000001'}, { manifest: {} }, { object: 'ec__document_template', ec__status: 'draft', ec__sites: [], ec__key: '11111', ec__title: 'title 1 MIG', ec__identifier: '000001' }],
      ['Consents with same ec__identifier but different ec__key should have last 5 digits of ec__key appended onto the ec__identifier', { object: 'ec__document_template', ec__status: 'draft', ec__key: '33333', ec__title: 'title 3', ec__identifier: '000001' }, { manifest: {} }, { object: 'ec__document_template', ec__status: 'draft', ec__sites: [], ec__key: '33333', ec__title: 'title 3', ec__identifier: '000001-33333' }],
      ['Consents with same ec__key but different ec__identifier should overwrite the template in the target org with the same ec__key', { object: 'ec__document_template', ec__status: 'draft', ec__key: '22222', ec__title: 'title MIG AGAIN', ec__identifier: '000001' }, { manifest: {} }, { object: 'ec__document_template', ec__status: 'draft', ec__key: '22222', ec__title: 'title MIG AGAIN', ec__identifier: '000001-22222', ec__sites: [] }],
    ])('%s', (test, resource, memo, expected) => {

      let transformedResource
      transform.beforeAll(memo)

      try {
        transformedResource = transform.each(resource, memo)
      } catch (err) {
        transformedResource = err
      }


      expect(transformedResource)
        .toStrictEqual(expected)
    })
  })

})
