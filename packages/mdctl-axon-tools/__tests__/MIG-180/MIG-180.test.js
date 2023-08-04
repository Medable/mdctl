/* eslint-disable import/order */

jest.mock('@medable/mdctl-api-driver', () => ({
    Driver: class {
    }
}), {virtual: true})
jest.mock('@medable/mdctl-api-driver/lib/cortex.object', () => ({
    Object: class {
    }, Org: class {
    }
}), {virtual: true})
jest.mock('../../lib/mappings')

    StudyManifestTools = require('../../lib/StudyManifestTools')

describe('MIG-180 - Test Export specific workflows from a study', () => {

    let manifestTools
    const workflow = {
        "_id": "67725gbe28e7f98ee3c8668",
        "favorite": false,
        "object": "wf__workflow",
        "wf__actions": [
            {
                "wf__params": {
                    "wf__notification_name": "c_axon_virtual_visit_15m_reminder"
                },
                "wf__type": "SITE_NOTIFICATION"
            }
        ],
        "wf__conditions_exclusion": [],
        "wf__conditions_inclusion": [
            {
                "wf__params": {
                    "wf__step": "fcc78b2a-f3d3-43e9-b856-b02fef9d9595",
                    "wf__pattern_type": "MATCH",
                    "wf__aggregation": "AVG",
                    "wf__period": {
                        "wf__unit": "day",
                        "wf__value": -2
                    },
                    "wf__comparison_type": "=",
                    "wf__match_value": 1
                },
                "wf__type": "STEP_RESPONSE_BASED"
            }
        ],
        "wf__key": "99d4d48b-1fd7-4e18-87b7-4e082e2984d2",
        "wf__meta": {
            "wf__active": true,
            "wf__name": "insulin_level_alert",
            "wf__version": "1.0.0"
        },
        "wf__start": {
            "wf__params": {
                "wf__tasks": [
                    "c8a0106c-a2ea-4dd6-988d-45500486f9ad"
                ],
                "wf__offset": 0
            },
            "wf__type": "TASK_RESPONSE_COMPLETED"
        }
    }

    const mockGetExportedObjects = jest.fn(() => [workflow]),
        existingStudy = {
            _id: '1',
            c_name: 'Study',
            c_key: 'abc'
        },
        hasNextStudyMock = jest.fn(() => true),
        nextStudyMock = jest.fn(() => existingStudy)
    const entities = [{
            _id: '615bcd016631cc0100d2766c',
            object: 'c_study',
            c_key: 'key-001'
        },
            {
                _id: '615b60d1bf2e4301008f4d68',
                object: 'c_dummy_object',
                c_key: 'key-002'
            },
            {
                _id: '619aaaafe44c6e01003f7313',
                object: 'c_task',
                c_key: 'key-003'
            },
            {
                _id: '61981246ca9563010037bfa8',
                object: 'c_task',
                c_key: 'key-004'
            },
            {
                _id: '61981246ca95714c14e61a8c',
                object: 'c_step',
                c_key: 'key-005'
            },
            {
                _id: '61981246ca966caef6108f28',
                object: 'c_step',
                c_key: 'key-006'
            },
            {
                _id: '61981246ca9592ee0e41a3dd',
                object: 'ec__document_template',
                c_key: 'key-007'
            },
            {
                _id: '61980eb292466ea32e087378',
                object: 'ec__document_template',
                c_key: 'key-008'
            },
            {
                _id: '6d525cf2e328e7300d97c399',
                object: 'ec__default_document_css',
                c_key: 'key-009'
            },
            {
                _id: '6d525cfe328e64ac0833baef',
                object: 'ec__knowledge_check',
                c_key: 'key-010'
            },
            {
                _id: '6d525f2e328e7f1e48262523',
                object: 'ec__knowledge_check',
                c_key: 'key-011'
            },
            {
                _id: '6d525gbed28e7f1e4826bb76',
                object: 'c_visit_schedule',
                c_key: 'key-012'
            },
            {
                _id: '6d525gc1408e7f1e4826bb11',
                object: 'c_visit',
                c_key: 'key-013'
            },
            {
                _id: '6d525gbe28e7fc4ff43c310',
                object: 'c_group',
                c_key: 'key-014'
            },
            {
                _id: '67725gbe28e7f98ee3c8667',
                object: 'c_group_task',
                c_key: 'key-015'
            },
            workflow
        ],
        org = {
            objects: {
                c_study: {
                    readOne: () => ({
                        execute: () => ({
                            hasNext: hasNextStudyMock,
                            next: nextStudyMock
                        })
                    })
                },
                c_task: {
                    find: () => ({
                        paths: () => ({
                            limit: () => ({
                                toArray: () => entities.filter(e => e.object === 'c_task')
                            })
                        }),
                        limit: () => ({
                            toArray: () => entities.filter(e => e.object === 'c_task')
                        })
                    })
                },
                wf__workflow: {
                    find: () => ({
                        limit: () => ({
                            toArray: () => entities.filter(e => e.object === 'wf__workflow')
                        })
                    })
                },
                object: {
                    find: () => ({
                        paths: () => ({
                            toArray: () => [{uniqueKey: 'c_key'}]
                        })
                    })
                }
            }
        }

    beforeAll(async () => {
        manifestTools = new StudyManifestTools({})
        manifestTools.getExportObjects = mockGetExportedObjects
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('Test workflow not excluded from manifest when workflow id passed', async () => {
        const manifestEntitiesToCompare = [
                workflow,
                {
                    _id: '619aaaafe44c6e01003f7313',
                    object: 'c_task',
                    c_key: 'key-003'
                },
                {
                    _id: '61981246ca9563010037bfa8',
                    object: 'c_task',
                    c_key: 'key-004'
                },
                {
                    _id: '61981246ca95714c14e61a8c',
                    object: 'c_step',
                    c_key: 'key-005'
                },
                {
                    _id: '61981246ca966caef6108f28',
                    object: 'c_step',
                    c_key: 'key-006'
                }

            ]

        const getTaskManifestEntitiesMockFn = jest.spyOn(StudyManifestTools.prototype, 'getTaskManifestEntities').mockImplementation(() => entities.filter(o => ['c_task', 'c_step', 'c_branch'].includes(o.object)))
        const manifestEntities = await manifestTools.getWorkflowManifestEntities(org, ['67725gbe28e7f98ee3c8668'], {})
        expect(getTaskManifestEntitiesMockFn).toHaveBeenCalled()
        expect(manifestEntities).toStrictEqual(manifestEntitiesToCompare)
    })


})
