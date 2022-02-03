// eslint-disable-next-line import/no-dynamic-require
const StudyManifestTools = require('../../lib/StudyManifestTools')

jest.mock('runtime.transform', () => ({ Transform: class {} }), { virtual: true })
jest.mock('@medable/mdctl-core-utils/privates', () => ({ privatesAccessor: () => ({ options: { dir: __dirname } }) }), { virtual: true })
jest.mock('@medable/mdctl-api-driver', () => ({ Driver: class {} }), { virtual: true })
jest.mock('@medable/mdctl-api-driver/lib/cortex.object', () => ({ Object: class {} }), { virtual: true })
jest.mock('config', () => ({ get: jest.fn(() => '1.0') }), { virtual: true })

describe('StudyManifestTools', () => {

  const entity = {
    c_key: '2a0ce2d8-f572-41b7-8f95-687575a6388a',
    c_participant_schedules: [
      '619d120d5f596301004e77b3',
      '619d120d5f596301004e77b4',
      '619d120d5f596301004e77b5'
    ],
    c_start_date: {
      c_anchor_date_template: {
        _id: '61532aebf20c3601001b7818',
        object: 'c_anchor_date_template',
        path: '/c_anchor_date_templates/61532aebf20c3601001b7818'
      }
    },
    c_task: {
      _id: '619d12135f596301004e8296',
      object: 'c_task',
      path: '/c_tasks/619d12135f596301004e8296'
    },
    c_conditions: [
      {
        c_task_completion: {
          _id: '616129476a9d8e0100c642a0',
          object: 'c_task',
          path: '/c_tasks/616129476a9d8e0100c642a0'
        }
      },
      {
        c_task_completion: {
          _id: '616129e1e7b0f50100a30e5f',
          object: 'c_task',
          path: '/c_tasks/616129e1e7b0f50100a30e5f'
        }
      }
    ],
    c_some_object_id: '616129e1e7b0f50100a30e77',
    c_assignment_availability: [],
    type: 'c_ad_hoc_assignment',
    _id: '619d125c5f596301004ef0fc',
    object: 'c_task_assignment'
  }

  it('getIdsFromEntity', () => {

    const studyManifestTools = new StudyManifestTools(),
          expectedIds = [
            '619d120d5f596301004e77b3',
            '619d120d5f596301004e77b4',
            '619d120d5f596301004e77b5',
            '61532aebf20c3601001b7818',
            '619d12135f596301004e8296',
            '616129476a9d8e0100c642a0',
            '616129e1e7b0f50100a30e5f',
            '616129e1e7b0f50100a30e77',
            '619d125c5f596301004ef0fc'
          ],

          entityIds = studyManifestTools.getIdsFromEntity(entity)

    expect(entityIds)
      .toStrictEqual(expectedIds)

  })

  it('getDependencyIssues', () => {

    const studyManifestTools = new StudyManifestTools(),

          outputEntities = [entity],
          removedEntities = [{
            entity: {
              _id: '616129e1e7b0f50100a30e5f',
              object: 'c_task',
            },
          }, {
            entity: {
              _id: '619d120d5f596301004e77b4',
              object: 'c_participant_schedule'
            }
          }],
          dependencyIssues = studyManifestTools.getDependencyIssues(outputEntities, removedEntities)

    console.log(dependencyIssues)

  })
})
