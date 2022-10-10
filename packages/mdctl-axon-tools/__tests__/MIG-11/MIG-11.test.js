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
          ec__title: 'title',
          ec__key: '1111'
        },
        {
          _id: '2',
          ec__status: 'published',
          ec__title: 'title',
          ec__key: '2222'
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
              readOne: ({ ec__key }) => ({
                skipAcl: () => ({
                  grant: () => ({
                    throwNotFound: () => ({
                      paths: () => ({
                        execute: () => existingConsents.find(v => v.ec__key === ec__key) || existingConsents[0]
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

    const docErr = { code: 'kInvalidArgument', errCode: 'cortex.invalidArgument.updateDisabled', reason: 'An eConsent template in this import exists in the target and is not in draft', message: 'Template [title] ([2222]) already exists in the target org and is not in DRAFT status, re-migration is not allowed' }
    it.each([
      // test, resource, memo, expected
      ['Draft consents should be imported ', { object: 'ec__document_template', ec__status: 'draft', ec__key: '1111' }, { manifest: {} }, { object: 'ec__document_template', ec__status: 'draft', ec__sites: [], ec__key: '1111' }],
      ['Published docs not existing in target should be imported', { object: 'ec__document_template', ec__status: 'published', ec__key: '3333', ec__title: 'title' }, { manifest: {} }, { object: 'ec__document_template', ec__status: 'draft', ec__sites: [], ec__key: '3333', ec__title: 'title' }],
      ['Published docs existing should throw an error', { object: 'ec__document_template', ec__status: 'draft', ec__key: '2222', ec__title: 'title' }, { manifest: {} }, docErr],
      ['Published docs no existing should be imported as draft', { object: 'ec__document_template', ec__status: 'published', ec__key: '4444', ec__title: 'title - 2' }, { manifest: {} }, { object: 'ec__document_template', ec__status: 'draft', ec__sites: [], ec__key: '4444', ec__title: 'title - 2' }],
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
