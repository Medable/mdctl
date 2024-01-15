// eslint-disable-next-line import/no-dynamic-require
const fs = require('fs')
const { isEqual } = require('lodash')
const Transform = require('../../packageScripts/ingestTransform.js')
const StudyManifestTools = require('../../lib/StudyManifestTools')

jest.mock('runtime.transform', () => ({ Transform: class {} }), { virtual: true })
jest.mock('@medable/mdctl-core-utils/privates', () => ({
  privatesAccessor: () => ({
    options: { dir: __dirname },
    orgObjects: [
      {
        name: 'c_study',
        uniqueKey: 'c_key',
      },
      {
        name: 'c_some_object',
        uniqueKey: 'c_key',
      }
    ]
  })
}), { virtual: true })
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
            memo = { studySchema: {} }

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
      ['should perform studyReferenceAdjustment', { object: 'c_some_object', c_study: '' }, { study: { c_key: 'abc' }, manifest: {} }, { object: 'c_some_object', c_study: 'c_study.abc' }],
      ['should perform studyAdjustments and add c_no_pii to false if it does not exist', { object: 'c_study' }, { manifest: {} }, { object: 'c_study', c_no_pii: false }],
      ['should perform studyAdjustments and preserve c_no_pii if it does exist', { object: 'c_study', c_no_pii: true }, { manifest: {} }, { object: 'c_study', c_no_pii: true }],
      ['should perform econsentDocumentTemplateAdjustments', { object: 'ec__document_template', ec__status: 'draft' }, { manifest: {} }, { object: 'ec__document_template', ec__status: 'draft', ec__sites: [] }],
      // eslint-disable-next-line object-curly-newline
      ['should not perform changes to manifest object', { object: 'manifest', c_study: {}, importOwner: false, exportOwner: false }, { study: { c_key: 'abc' }, manifest: {} }, { object: 'manifest', c_study: {}, importOwner: false, exportOwner: false }]
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
        packageJsonPath = `${__dirname}/${packageJson}`,
        afterInstallScript = 'install.after.js',
        afterInstallScriptPath = `${__dirname}/${afterInstallScript}`

  afterEach(() => {
    if (fs.existsSync(ingestTransformPath)) {
      fs.unlinkSync(ingestTransformPath)
    }

    if (fs.existsSync(packageJsonPath)) {
      fs.unlinkSync(packageJsonPath)
    }

    if (fs.existsSync(afterInstallScriptPath)) {
      fs.unlinkSync(afterInstallScriptPath)
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
        object: 'package', name: 'Consent export', version: '0.0.1', description: 'An export of consent template or multiple consent templates', pipes: { ingest: 'ingestTransform.js' }
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


  it('writePackage with install.after hook', () => {
    const packageType = 'study',
          expectedPackage = {
            object: 'package', name: 'Study export', version: '0.0.1', description: 'An export of a study', pipes: { ingest: 'ingestTransform.js' }, script: { afterImport: '123' }
          },
          studyManifestTools = new StudyManifestTools()

    studyManifestTools.writePackage(packageType, { script: { afterImport: '123' } })

    expect(fs.existsSync(packageJsonPath)).toBeTruthy()

    // eslint-disable-next-line one-var
    const copiedPackageJson = JSON.parse(fs.readFileSync(packageJsonPath))

    expect(copiedPackageJson)
      .toStrictEqual(expectedPackage)
  })

  it('should getIdsByReferenceType for each of the available types', () => {
    const studyManifestTools = new StudyManifestTools(),
          entity = {
            c_key: 'eafca833-7f7a-45f6-bba1-5bb7bad8c2ee',
            c_study: {
              _id: '60ca4a670ee6980100215a5d',
              object: 'c_study',
              path: '/c_studies/60ca4a670ee6980100215a5d'
            },
            c_visits: [
              '610bfcc53e5bb50100d87369',
              '611fe3cf6db3df0100238e01'
            ],
            _id: '60ca0d6c10f3800100661d0a',
            c_assignment_availability: [
              {
                c_flag: {
                  _id: '60ca0d7010f38001006621b0',
                  object: 'c_patient_flag',
                  path: '/c_patient_flags/60ca0d7010f38001006621b0'
                }
              },
              {
                c_flag: {
                  _id: '60ca0d7010f38001006621b1',
                  object: 'c_patient_flag',
                  path: '/c_patient_flags/60ca0d7010f38001006621b1'
                }
              }
            ],
            c_end_date_anchor: {
              c_template: {
                _id: '5fda25b723b606010051fa04',
                object: 'c_anchor_date_template',
                path: '/c_anchor_date_templates/5fda25b723b606010051fa04'
              }
            },
            c_group_id: '61e7f1c0abc1c50100056832',
            object: 'c_some_object'
          },
          someObjectReferences = [
            {
              name: 'c_study',
              array: false,
              object: 'c_study',
              type: 'Reference',
              required: false
            },
            {
              name: 'c_visits',
              array: true,
              object: 'c_visit',
              type: 'ObjectId',
              required: false
            },
            {
              name: 'c_assignment_availability',
              array: true,
              type: 'Document',
              required: false,
              documents: [
                {
                  name: 'c_flag',
                  array: false,
                  object: 'c_patient_flag',
                  type: 'Reference',
                  required: false,
                }
              ]
            },
            {
              name: 'c_end_date_anchor',
              array: false,
              type: 'Document',
              required: false,
              documents: [
                {
                  name: 'c_template',
                  array: false,
                  object: 'c_anchor_date_template',
                  type: 'Reference',
                  required: false
                }
              ]
            },
            {
              name: 'c_group_id',
              array: false,
              type: 'ObjectId',
              required: false
            },
          ],
          ids = studyManifestTools.getIdsByReferenceType(entity, someObjectReferences)

    expect(ids)
      .toStrictEqual([
        { reference: 'c_study', referenceIds: [{ _id: '60ca4a670ee6980100215a5d', reference: 'c_study', required: false }], required: false },
        { reference: 'c_visits', referenceIds: [{ _id: '610bfcc53e5bb50100d87369', reference: 'c_visits', required: false }, { _id: '611fe3cf6db3df0100238e01', reference: 'c_visits', required: false }], required: false },
        { reference: 'c_assignment_availability', referenceIds: [{ _id: '60ca0d7010f38001006621b0', reference: 'c_flag', required: false }, { _id: '60ca0d7010f38001006621b1', reference: 'c_flag', required: false }], required: false },
        { reference: 'c_end_date_anchor', referenceIds: [{ _id: '5fda25b723b606010051fa04', reference: 'c_template', required: false }], required: false },
        { reference: 'c_group_id', referenceIds: [{ _id: '61e7f1c0abc1c50100056832', reference: 'c_group_id', required: false }], required: false }
      ])
  })


  it('should getEntityIssues', () => {

    const studyManifestTools = new StudyManifestTools(),
          entity = {
            c_key: 'eafca833-7f7a-45f6-bba1-5bb7bad8c2ee',
            c_visits: [
              '610bfcc53e5bb50100d87369',
              '611fe3cf6db3df0100238e01'
            ],
            _id: '60ca0d6c10f3800100661d0a',
            object: 'c_some_entity'
          },
          someEntityReferences = [{
            name: 'c_study',
            array: false,
            required: true,
            object: 'c_study',
            type: 'Reference'
          },
          {
            name: 'c_visits',
            array: true,
            required: false,
            object: 'c_visit',
            type: 'ObjectId'
          }],
          refEntityIds = studyManifestTools.getIdsByReferenceType(entity, someEntityReferences),
          entities = [
            {
              object: 'c_visit',
              _id: '610bfcc53e5bb50100d87369'
            }],
          issues = studyManifestTools.getEntityIssues(entity, refEntityIds, entities)

    expect(issues)
      .toStrictEqual([
        'No entity id for c_some_entity 60ca0d6c10f3800100661d0a for reference c_study',
        "The object c_some_entity (60ca0d6c10f3800100661d0a) is removed from export because it depends on c_visits (611fe3cf6db3df0100238e01) which doesn't exist"
      ])

  })


  it('should getReferences', () => {

    const studyManifestTools = new StudyManifestTools(),
          objectSchema = {
            label: 'Participant Group',
            name: 'c_group',
            uniqueKey: 'c_key',
            properties: [
              {
                validators: [],
                label: 'Visit Schedules',
                name: 'c_visit_schedules',
                sourceObject: 'c_visit_schedule',
                type: 'ObjectId',
                array: true
              },
              {
                array: false,
                label: 'Anchor Date',
                name: 'c_anchor_date',
                sourceObject: 'c_anchor_date_template',
                type: 'Reference',
                validators: [{
                  name: 'required'
                }]
              },
              {
                label: 'Schedule',
                name: 'c_schedule',
                properties: [
                  {
                    array: false,
                    label: 'Anchor Date',
                    name: 'c_anchor_date',
                    sourceObject: 'c_anchor_date_template',
                    type: 'Reference'
                  },
                  {
                    validators: [],
                    label: 'Name',
                    name: 'c_name',
                    sourceObject: 'c_name',
                    type: 'String',
                    array: false
                  }
                ],
                type: 'Document',
                array: false,
                validators: []
              },
            ]
          },
          expectedReferences = [
            {
              name: 'c_visit_schedules',
              array: true,
              object: 'c_visit_schedule',
              required: false,
              type: 'ObjectId'
            },
            {
              name: 'c_anchor_date',
              array: false,
              object: 'c_anchor_date_template',
              required: true,
              type: 'Reference'
            },
            {
              name: 'c_schedule',
              array: false,
              required: false,
              type: 'Document',
              documents: [
                {
                  name: 'c_anchor_date',
                  array: false,
                  object: 'c_anchor_date_template',
                  required: false,
                  type: 'Reference'
                }
              ]
            }
          ],
          references = studyManifestTools.getReferences(objectSchema)

    expect(references)
      .toStrictEqual(expectedReferences)

  })

  it('should getReferenceProps for each of the available types', () => {
    const studyManifestTools = new StudyManifestTools(),
          someObjectReferences = [
            {
              name: 'c_study',
              array: false,
              object: 'c_study',
              type: 'Reference',
              required: false
            },
            {
              name: 'c_visits',
              array: true,
              object: 'c_visit',
              type: 'ObjectId',
              required: false
            },
            {
              name: 'c_assignment_availability',
              array: true,
              type: 'Document',
              required: false,
              documents: [
                {
                  name: 'c_flag',
                  array: false,
                  object: 'c_patient_flag',
                  type: 'Reference',
                  required: false,
                }
              ]
            },
            {
              name: 'c_end_date_anchor',
              array: false,
              type: 'Document',
              required: false,
              documents: [
                {
                  name: 'c_template',
                  array: false,
                  object: 'c_anchor_date_template',
                  type: 'Reference',
                  required: false
                }
              ]
            }
          ],
          referenceProps = studyManifestTools.getReferenceProps(someObjectReferences)

    expect(referenceProps)
      .toStrictEqual([
        'c_study',
        'c_visits',
        'c_assignment_availability.c_flag',
        'c_end_date_anchor.c_template'
      ])
  })

  it('should createManifest', () => {
    const entities = [{
            _id: '615bcd016631cc0100d2766c',
            object: 'c_study',
            c_key: 'key-001'
          },
          {
            _id: '615b60d1bf2e4301008f4d68',
            object: 'c_some_object',
            c_key: 'key-002'
          }],

          studyManifestTools = new StudyManifestTools(),

          manifest = studyManifestTools.createManifest(entities)

    expect(manifest)
      .toStrictEqual({
        object: 'manifest',
        dependencies: false,
        exportOwner: false,
        importOwner: false,
        c_study: {
          includes: [
            'key-001'
          ],
          defer: [
            'c_public_group',
            'c_default_subject_site',
            'c_default_subject_visit_schedule',
            'c_default_subject_group',
            'c_default_participant_schedule',
            'c_menu_config.c_group_id'
          ]
        },
        c_some_object: {
          includes: [
            'key-002'
          ]
        }
      })
  })

  it('writeInstallAfterScript', () => {

    const studyManifestTools = new StudyManifestTools(),

          expectedScript = 'some very interesting script',

          packageReference = studyManifestTools.writeInstallAfterScript(expectedScript)

    expect(packageReference)
      .toStrictEqual({
        scripts: {
          afterImport: 'install.after.js'
        }
      })

    expect(fs.existsSync(afterInstallScriptPath)).toBeTruthy()

    // eslint-disable-next-line one-var
    const afterInstallScriptContent = fs.readFileSync(afterInstallScriptPath)

    expect(afterInstallScriptContent.toString())
      .toBe(expectedScript)
  })

  // eslint-disable-next-line one-var
  const siteMock = (where, paths) => ({
          objects: {
            c_sites: {
              find(whereArg) {

                if (!isEqual(where, whereArg)) throw new Error('Invalid find where clause')

                return {
                  paths(pathsArg) {

                    if (!isEqual(paths, pathsArg)) throw new Error('Invalid paths clause')

                    return {
                      limit(limitClause) {

                        if (limitClause !== false) throw new Error('Invalid limit clause')

                        return {
                          async toArray() {
                            return [{ _id: '123' }]
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }),

        ecKnowledgeChecks = where => ({
          objects: {
            ec__document_templates: {
              aggregate(whereArg) {

                const expectedAggregation = [
                  {
                    $match: where
                  },
                  {
                    $project: {
                      ec__knowledge_checks: {
                        $expand: {
                          limit: 1000,
                          pipeline: [{
                            $project: {
                              _id: 1,
                              object: 1
                            }
                          }]
                        }
                      }
                    }
                  }
                ]

                if (!isEqual(whereArg, expectedAggregation)) throw new Error('Invalid where clause')

                return {
                  limit(limitClause) {

                    if (limitClause !== 500000) throw new Error('Invalid limit clause')

                    return {
                      async toArray() {
                        return [{
                          _id: '321',
                          ec__knowledge_checks: {
                            data: [
                              { _id: '123' }
                            ]
                          }
                        }]
                      }
                    }
                  }
                }
              }
            }
          }
        })

  it.each([
    ['c_sites', siteMock, { _id: '123' }, ['_id']],
    ['ec__knowledge_checks', ecKnowledgeChecks, { _id: '123' }, ['_id']]
  ])('getExportArray: %s', async(object, mock, where, paths) => {

    const studyManifestTools = new StudyManifestTools(),
          org = mock(where, paths),

          resArray = await studyManifestTools.getExportArray(org, object, where, paths)

    expect(resArray).toHaveLength(1)

    expect(resArray[0]).toStrictEqual({ _id: '123' })
  })

})
