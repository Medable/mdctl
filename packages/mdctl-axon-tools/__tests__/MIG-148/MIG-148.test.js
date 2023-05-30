jest.mock('@medable/mdctl-api-driver', () => ({ Driver: class {} }), { virtual: true })
jest.mock('@medable/mdctl-api-driver/lib/cortex.object', () => ({ Object: class {}, Org: class {} }), { virtual: true })

const StudyManifestTools = require('../../lib/StudyManifestTools')

describe('MIG-148 - Test StudyManifestTools ', () => {

  let manifestTools
  const ecDocTemplate = {
          _id: '61981246ca9592ee0e41a3dd',
          ec__builder_data: {
            'ck-widgets-data': [
              {
                data: {
                  _id: '6374da8e36ba402f85f9c59a',
                  ec__custom_data: [],
                  ec__description: '',
                  ec__initials: false,
                  ec__key: 'fba1c4bb-8de1-4587-af15-1ebf53e97e2b',
                  ec__label: 'IS Signature',
                  ec__optional: false,
                  ec__order: 0,
                  ec__signer_role: 'Internal Signer Sign',
                  ec__title: '1667980689266-82'
                },
                id: 'fba1c4bb-8de1-4587-af15-1ebf53e97e2b',
                type: 'signature'
              },
              {
                data: {
                  _id: '6374da8f5141041870e22a88',
                  ec__answer_context: 'KC - C1 is correct',
                  ec__description: ' ',
                  ec__document_template: {
                    _id: '6374da8e5141041870e2295a',
                    object: 'ec__document_template',
                    path: '/ec__document_templates/6374da8e5141041870e2295a'
                  },
                  ec__identifier: '1668419881899-44',
                  ec__key: '00df925a-9fc9-4ee7-855e-86b5ae351f88',
                  ec__label: 'KC LABEL',
                  ec__optional: true,
                  ec__options: [
                    'KC - C1',
                    'KC- C2'
                  ],
                  ec__options_answer: [
                    'KC - C1'
                  ],
                  ec__question: 'KC QUESTION',
                  ec__signer_role: 'Internal Signer Sign',
                  ec__type: 'ec__knowledge_checks',
                  favorite: false,
                  object: 'ec__knowledge_check',
                  shared: false
                },
                id: '00df925a-9fc9-4ee7-855e-86b5ae351f88',
                type: 'knowledgeCheck'
              },
              {
                data: {
                  _id: '6374da8e36ba402f85f9c59b',
                  ec__custom_data: [],
                  ec__description: '',
                  ec__key: 'c4e8ac84-4d00-4ade-8baa-1e83e4d9fff4',
                  ec__optional: false,
                  ec__signer_role: 'Internal Signer Sign',
                  ec__title: '1667980830296-84',
                  ec__type: 'ec__text'
                },
                id: 'c4e8ac84-4d00-4ade-8baa-1e83e4d9fff4',
                type: 'input'
              },
              {
                data: {
                  _id: '6374da8e36ba402f85f9c59c',
                  ec__custom_data: [],
                  ec__description: '',
                  ec__key: '4b121de3-1957-4ede-818b-dae18110f359',
                  ec__optional: false,
                  ec__signer_role: 'Internal Signer Sign',
                  ec__title: '1667980897526-87',
                  ec__type: 'ec__numeric'
                },
                id: '4b121de3-1957-4ede-818b-dae18110f359',
                type: 'input'
              }
            ]
          },
          ec__custom_data: [],
          ec__description: 'For MIG-126',
          ec__econsent_version: '1.6.0',
          ec__enroll_subject: false,
          ec__html: '',
          ec__identifier: '000004',
          ec__key: '8c16e1ad-f3b4-41c8-a6fb-a68d1d28f188',
          ec__language: 'en_US',
          ec__pts_only: false,
          ec__pts_set: false,
          ec__requested_data: [
            {
              _id: '6374da8e36ba402f85f9c59b',
              ec__custom_data: [],
              ec__description: '',
              ec__key: 'c4e8ac84-4d00-4ade-8baa-1e83e4d9fff4',
              ec__optional: false,
              ec__signer_role: 'Internal Signer Sign',
              ec__title: '1667980830296-84',
              ec__type: 'ec__text'
            },
            {
              _id: '6374da8e36ba402f85f9c59c',
              ec__custom_data: [],
              ec__description: '',
              ec__key: '4b121de3-1957-4ede-818b-dae18110f359',
              ec__optional: false,
              ec__signer_role: 'Internal Signer Sign',
              ec__title: '1667980897526-87',
              ec__type: 'ec__numeric'
            }
          ],
          ec__requested_signatures: [
            {
              _id: '6374da8e36ba402f85f9c59a',
              ec__custom_data: [],
              ec__description: '',
              ec__initials: false,
              ec__key: 'fba1c4bb-8de1-4587-af15-1ebf53e97e2b',
              ec__label: 'IS Signature',
              ec__optional: false,
              ec__order: 0,
              ec__signer_role: 'Internal Signer Sign',
              ec__title: '1667980689266-82'
            }
          ],
          ec__signer_roles: [
            {
              _id: '6374da8e36ba402f85f9c599',
              ec__key: 'a6348bb1-efce-4415-86a2-ee08140405c0',
              ec__order: 1,
              ec__role: 'Internal Signer Sign',
              ec__signer_type: 'internal signer'
            }
          ],
          ec__sites: [],
          ec__status: 'draft',
          ec__study: {
            _id: '6374d3905141041870e1e24d',
            object: 'c_study',
            path: '/c_studies/6374d3905141041870e1e24d'
          },
          ec__styles: [],
          ec__title: 'TM MIG-126',
          ec__version: '0.1',
          object: 'ec__document_template'
        },
        exportableObject = ['ec__document_template', 'c_visit'],
        keyName = 'c_key',
        mockGetExportedObjects = jest.fn(() => []),
        existingStudy = [{
          _id: '1',
          c_name: 'Study',
          c_key: 'abc',
          c_menu_config: []
        }],
        entities = [{
          _id: '6374d3905141041870e1e24d',
          object: 'c_study',
          c_key: 'key-001'
        },
        {
          _id: '61981246ca9592ee0e41a3dd',
          object: 'ec__document_template',
          c_key: '8c16e1ad-f3b4-41c8-a6fb-a68d1d28f188'
        },
        {
          _id: '6d525cf2e328e7300d97c399',
          object: 'ec__default_document_css',
          c_key: 'key-002'
        },
        {
          _id: '6374da8f5141041870e22a88',
          object: 'ec__knowledge_check',
          c_key: '00df925a-9fc9-4ee7-855e-86b5ae351f88'
        }],
        dummyReferences = [
          {
            name: 'c_study',
            array: false,
            object: 'c_study',
            type: 'Reference',
            required: false
          }
        ],
        org = {
          objects: {
            c_study: {
              find: () => ({
                paths: () => ({
                  limit: () => ({
                    toArray: () => existingStudy
                  }),
                })
              })
            },
            object: {
              find: () => ({
                paths: () => ({
                  toArray: () => [{ uniqueKey: 'c_key' }]
                })
              })
            },
            ec__document_templates: {
              find: () => ({
                limit: () => ({
                  paths: () => ({
                    toArray: () => ([ecDocTemplate])
                  })
                })
              })
            }
          }
        },
        installAfterScript = `
    import _ from 'lodash'
    const { run } = require('expressions')

    const mappings = [{"path":"ec__document_template.8c16e1ad-f3b4-41c8-a6fb-a68d1d28f188.ec__builder_data","mapTo":{"$let":{"vars":{"originalTemplate":{"$dbNext":{"object":"ec__document_template","operation":"cursor","where":{"ec__key":"8c16e1ad-f3b4-41c8-a6fb-a68d1d28f188"},"expand":["ec__knowledge_checks"],"passive":true}}},"in":{"$object":{"ck-widgets-data":{"$concatArrays":[{"$map":{"input":"$$originalTemplate.ec__requested_signatures","as":"entry","in":{"$object":{"ec__key":"$$entry.ec__key","_id":"$$entry._id"}}}},{"$map":{"input":"$$originalTemplate.ec__knowledge_checks.data","as":"entry","in":{"$object":{"ec__key":"$$entry.ec__key","_id":"$$entry._id"}}}},{"$map":{"input":"$$originalTemplate.ec__requested_data","as":"entry","in":{"$object":{"ec__key":"$$entry.ec__key","_id":"$$entry._id"}}}}]}}}}}}]

    mappings.forEach(({ path, mapTo }) => {

      const [entity, entityKey, property, ...rest] = path.split('.'),
          isDocPropUpdate = !!rest.length
      let value = run(mapTo)

      const prop = entity.startsWith('ec__') ? 'ec__key' : 'c_key'

      if (isDocPropUpdate) {
        const [entityResult] = org.objects[entity]
          .find({ [prop]: entityKey })
          .paths(property)
          .limit(1)
          .toArray()

        if (!entityResult) return

        const documentProps = entityResult[property]

        if (!documentProps) return

        const [docPropKey, docProp] = rest

        if (!docPropKey || !docProp) return

        const propToUpdate = documentProps.find(({ c_key }) => c_key === docPropKey),

              idToUpdate = propToUpdate._id

        return org.objects[entity]
          .updateOne({ c_key: entityKey })
          .pathUpdate(property + '/' + idToUpdate + '/' + docProp , value)

      }

      if (entity === 'ec__document_template' && prop === 'ec__key' && property === 'ec__builder_data') {

        const idMapping = _.keyBy(value['ck-widgets-data'], 'ec__key')
        const {
          _id: template_id,
          ec__builder_data: { "ck-widgets-data": originalBuilderData },
          ec__status, creator, owner, updater
        } = org.objects.ec__document_templates.find({ ec__key: entityKey })
              .paths('ec__builder_data', 'ec__status', 'creator', 'owner', 'updater')
              .next()

        //We can update only draft templates
        if (ec__status !== 'draft') {
          return
        }

        //Map ids between builder_data and corresponding entities
        let new_builder_data = originalBuilderData.map((obd) => {
            const updatedId = _.get(idMapping, obd.id + '._id')
            _.set(obd, 'data._id', updatedId)
            _.get(obd, 'data.ec__document_template._id', false) && _.set(obd, 'data.ec__document_template._id', template_id)
            _.get(obd, 'data.ec__document_template.path', false) && _.set(obd, 'data.ec__document_template.path', '/ec__document_templates/' + template_id)
            _.get(obd, 'data.creator', false) && _.set(obd, 'data.creator', creator)
            _.get(obd, 'data.owner', false) && _.set(obd, 'data.owner', owner)
            _.get(obd, 'data.updater', false) && _.set(obd, 'data.updater', updater)
            return obd
        })
        value = { "ck-widgets-data": new_builder_data }
      }

      //normal prop update
      return org.objects[entity]
        .updateOne({ [prop]: entityKey }, { $set: { [property]: value }})
        .execute()

    })`

  beforeAll(async() => {
    manifestTools = new StudyManifestTools({})
    manifestTools.getExportObjects = mockGetExportedObjects
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Test install.after.js creation when exporting eConsent templates using partial export', async() => {
    const manifest = {
      object: 'manifest',
      ec__document_template: {
        includes: [
          '8c16e1ad-f3b4-41c8-a6fb-a68d1d28f188'
        ]
      },
      ec__default_document_css: {
        includes: [
          'key-002'
        ]
      },
      ec__knowledge_check: {
        includes: [
          '00df925a-9fc9-4ee7-855e-86b5ae351f88'
        ]
      }
    }

    jest.spyOn(StudyManifestTools.prototype, 'getExportableObjects').mockImplementation(() => exportableObject)
    jest.spyOn(StudyManifestTools.prototype, 'getKeyName').mockImplementation(() => keyName)
    jest.spyOn(StudyManifestTools.prototype, 'getOrgObjectInfo').mockImplementation(() => dummyReferences)
    jest.spyOn(StudyManifestTools.prototype, 'getOrgAndReferences').mockImplementation(() => ({ org, dummyReferences }))
    jest.spyOn(StudyManifestTools.prototype, 'validateReferences').mockImplementation(() => entities)
    jest.spyOn(StudyManifestTools.prototype, 'createManifest').mockImplementation(() => manifest)
    jest.spyOn(StudyManifestTools.prototype, 'getObjectIDsArray').mockImplementation(() => entities.filter(o => o.object === 'ec__document_template'))
    jest.spyOn(StudyManifestTools.prototype, 'mapObjectNameToPlural').mockImplementation(() => 'ec__document_templates')
    // eslint-disable-next-line one-var
    const manifestAndDeps = await manifestTools.buildManifestAndDependencies(manifest)

    expect(manifestAndDeps.manifest)
      .toStrictEqual(manifest)
    expect(manifestAndDeps.removedEntities)
      .toBeUndefined()
    expect(manifestAndDeps.mappingScript)
      .toStrictEqual(installAfterScript)
  })


  it('Test install.after.js creation when exporting eConsent templates using specific command', async() => {
    const manifest = {
      object: 'manifest',
      ec__document_template: {
        includes: [
          '8c16e1ad-f3b4-41c8-a6fb-a68d1d28f188'
        ]
      },
      ec__default_document_css: {
        includes: [
          'key-002'
        ]
      },
      ec__knowledge_check: {
        includes: [
          '00df925a-9fc9-4ee7-855e-86b5ae351f88'
        ]
      }
    }

    jest.spyOn(StudyManifestTools.prototype, 'getOrgObjectInfo').mockImplementation(() => dummyReferences)
    jest.spyOn(StudyManifestTools.prototype, 'getOrgAndReferences').mockImplementation(() => ({ org, dummyReferences }))
    jest.spyOn(StudyManifestTools.prototype, 'getConsentManifestEntities').mockImplementation(() => entities)
    jest.spyOn(StudyManifestTools.prototype, 'getObjectIDsArray').mockImplementation(() => entities.filter(o => o.object === 'ec__document_template'))
    jest.spyOn(StudyManifestTools.prototype, 'mapObjectNameToPlural').mockImplementation(() => 'ec__document_templates')
    jest.spyOn(StudyManifestTools.prototype, 'createManifest').mockImplementation(() => manifest)

    // eslint-disable-next-line one-var
    const manifestAndDeps = await manifestTools.buildConsentManifestAndDependencies(['61981246ca9592ee0e41a3dd'])

    expect(manifestAndDeps.manifest)
      .toStrictEqual(manifest)
    expect(manifestAndDeps.mappingScript)
      .toStrictEqual(installAfterScript)
  })

})
