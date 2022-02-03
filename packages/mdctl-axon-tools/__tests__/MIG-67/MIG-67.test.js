// eslint-disable-next-line import/no-dynamic-require
const fs = require('fs')
const Transform = require('../../packageScripts/ingestTransform.js')
const StudyManifestTools = require('../../lib/StudyManifestTools')

jest.mock('runtime.transform', () => ({ Transform: class {} }), { virtual: true })
jest.mock('@medable/mdctl-core-utils/privates', () => ({ privatesAccessor: () => ({ options: { dir: __dirname } }) }), { virtual: true })
jest.mock('@medable/mdctl-api-driver', () => ({ Driver: class {} }), { virtual: true })
jest.mock('@medable/mdctl-api-driver/lib/cortex.object', () => ({ Object: class {} }), { virtual: true })
jest.mock('config', () => ({ get: jest.fn(() => '1.0') }), { virtual: true })

describe('StudyManifestTools', () => {

  const ingestTransform = 'ingestTransform.js',
        ingestTransformPath = `${__dirname}/${ingestTransform}`,
        packageJson = 'package.json',
        packageJsonPath = `${__dirname}/${packageJson}`

  it('should getEntityIssues', () => {

    const studyManifestTools = new StudyManifestTools(),
          schema = {
            properties: [{
              _id: '61561efdf20c360100c06ada',
              array: true,
              auditable: false,
              label: 'Conditions',
              name: 'c_conditions',
              properties: [
                {
                  _id: '61561efdf20c360100c06adc',
                  label: 'Boolean Step',
                  name: 'c_boolean_step',
                  sourceObject: 'c_step',
                  type: 'Reference',
                },
                {
                  _id: '61561efdf20c360100c06adf',
                  label: 'Task Completion',
                  name: 'c_task_completion',
                  sourceObject: 'c_task',
                  type: 'Reference',
                }
              ],
              type: 'Document',
              validators: [
                {
                  _id: '6180828ed824670100876b02',
                  name: 'required'
                }
              ]
            }]
          },
          entity = {
            c_key: 'ffec35b5-d852-4c63-a820-e470304ee398',
            c_conditions: [
              {
                c_task_completion: {
                  _id: '615b60d1bf2e4301008f4d68',
                  object: 'c_task',
                  path: '/c_tasks/615b60d1bf2e4301008f4d68'
                }
              },
              {
                c_boolean_step: {
                  _id: '615bca961a20230100471c01',
                  object: 'c_step',
                  path: '/c_step/615bca961a20230100471c01'
                }
              },
              {
                c_task_completion: {
                  _id: '615b60d1bf2e4301008f4d77',
                  object: 'c_task',
                  path: '/c_tasks/615b60d1bf2e4301008f4d77'
                }
              },
            ],
            _id: '615bcd016631cc0100d2766c',
            object: 'c_patient_flag'
          },
          entities = [{
            _id: '615bcd016631cc0100d2766c',
            object: 'c_patient_flag'
          },
          {
            _id: '615b60d1bf2e4301008f4d68',
            object: 'c_task'
          }],
          patientFlagsReferences = studyManifestTools.getReferences(schema),
          refEntityIds = studyManifestTools.getIdsByReferenceType(entity, patientFlagsReferences),
          issues = studyManifestTools.getEntityIssues(entity, refEntityIds, entities)

    expect(issues).toHaveLength(2)
    expect(issues)
      .toStrictEqual([
        'Entity not found in export for c_patient_flag 615bcd016631cc0100d2766c for reference c_boolean_step id 615bca961a20230100471c01',
        'Entity not found in export for c_patient_flag 615bcd016631cc0100d2766c for reference c_task_completion id 615b60d1bf2e4301008f4d77'
      ])

  })
})
