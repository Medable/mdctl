const MenuConfigMap = require('../../lib/mappings/maps/MenuConfigMap')
const ReviewsTypesMap = require('../../lib/mappings/maps/ReviewTypesMap')
const EcBuilderDataMap = require('../../lib/mappings/maps/EcBuilderDataMap')

describe('Export Mappings', () => {

  const ecDocTemplate = {
    "ec__builder_data": {
      "ck-widgets-data": [
        {
          "data": {
            "_id": "wrongId",
            "ec__custom_data": [],
            "ec__description": "",
            "ec__initials": false,
            "ec__key": "c0d68417-3505-45d9-86ee-433e98bd0e2d",
            "ec__label": "sig",
            "ec__optional": false,
            "ec__order": 0,
            "ec__signer_role": "participant",
            "ec__title": "sig"
          },
          "id": "c0d68417-3505-45d9-86ee-433e98bd0e2d",
          "type": "signature"
        },
        {
          "data": {
            "_id": "wrongId",
            "ec__custom_data": [],
            "ec__description": "",
            "ec__initials": true,
            "ec__key": "4f4464f0-ca95-4667-b1c5-1e3cdb0e0e95",
            "ec__label": "init",
            "ec__optional": false,
            "ec__order": 0,
            "ec__signer_role": "participant",
            "ec__title": "init"
          },
          "id": "4f4464f0-ca95-4667-b1c5-1e3cdb0e0e95",
          "type": "signature"
        },
        {
          "data": {
            "_id": "wrongId",
            "ec__custom_data": [],
            "ec__description": "",
            "ec__key": "c3064e68-5b30-49ae-8a11-9bb0159d86ad",
            "ec__optional": false,
            "ec__signer_role": "participant",
            "ec__title": "text",
            "ec__type": "ec__text",
            "label": "text",
            "placeholder": null
          },
          "id": "c3064e68-5b30-49ae-8a11-9bb0159d86ad",
          "type": "input"
        },
        {
          "data": {
            "_id": "wrongId",
            "ec__custom_data": [],
            "ec__description": "",
            "ec__key": "eb789d2c-81bf-4288-97b0-2f736624ca14",
            "ec__optional": false,
            "ec__signer_role": "participant",
            "ec__title": "num",
            "ec__type": "ec__numeric",
            "label": "num",
            "placeholder": null
          },
          "id": "eb789d2c-81bf-4288-97b0-2f736624ca14",
          "type": "input"
        },
        {
          "data": {
            "_id": "wrongId",
            "ec__custom_data": [],
            "ec__description": "",
            "ec__key": "574f3e37-4106-47c3-b881-b2a0e6cbceff",
            "ec__optional": false,
            "ec__signer_role": "participant",
            "ec__title": "date",
            "ec__type": "ec__date",
            "label": "date",
            "placeholder": null
          },
          "id": "574f3e37-4106-47c3-b881-b2a0e6cbceff",
          "type": "input"
        },
        {
          "data": {
            "_id": "wrongId",
            "ec__custom_data": [],
            "ec__description": "",
            "ec__key": "19c3ccd3-4a87-4d4e-8368-9481fd1363ba",
            "ec__optional": false,
            "ec__signer_role": "participant",
            "ec__title": "email",
            "ec__type": "ec__email",
            "label": "email",
            "placeholder": null
          },
          "id": "19c3ccd3-4a87-4d4e-8368-9481fd1363ba",
          "type": "input"
        },
        {
          "data": {
            "_id": "wrongId",
            "choiceType": "multiple",
            "ec__allow_multiple": true,
            "ec__custom_data": [],
            "ec__description": "",
            "ec__key": "fd6435dd-93c0-4221-9cb8-43e61edfc15d",
            "ec__optional": false,
            "ec__selection_options": "Choice 1=Choice 1",
            "ec__signer_role": "participant",
            "ec__title": "multChoice",
            "ec__type": "ec__text_choice",
            "label": "multChoice",
            "options": [
              {
                "name": "Choice 1",
                "value": "Choice 1"
              }
            ]
          },
          "id": "fd6435dd-93c0-4221-9cb8-43e61edfc15d",
          "type": "checkboxGroup"
        },
        {
          "data": {
            "_id": "wrongId",
            "choiceType": "single",
            "ec__allow_multiple": false,
            "ec__custom_data": [],
            "ec__description": "",
            "ec__key": "d230fd0e-f25f-4177-9bb8-238ecf6ae9d3",
            "ec__optional": false,
            "ec__selection_options": "Choice 1=Choice 1",
            "ec__signer_role": "participant",
            "ec__title": "singChoice",
            "ec__type": "ec__text_choice",
            "label": "singChoice",
            "options": [
              {
                "name": "Choice 1",
                "value": "Choice 1"
              }
            ]
          },
          "id": "d230fd0e-f25f-4177-9bb8-238ecf6ae9d3",
          "type": "radioGroup"
        },
        {
          "data": {
            "_id": "wrongId",
            "access": 6,
            "accessRoles": [
              "62d5e6ce2c84dfd649f1f554"
            ],
            "created": "2022-08-31T21:00:36.731Z",
            "creator": {
              "_id": "6306a1b610b7f8775736f985",
              "object": "account",
              "path": "/accounts/6306a1b610b7f8775736f985"
            },
            "doNotPrint": false,
            "ec__answer_context": " ",
            "ec__custom_data": [],
            "ec__description": " ",
            "ec__document_template": {
              "_id": "630e6f7228194d6a96fff891",
              "object": "ec__document_template",
              "path": "/ec__document_templates/630e6f7228194d6a96fff891"
            },
            "ec__identifier": "1661979636011-23",
            "ec__key": "31c3fa0c-2ab2-48d2-9d97-6f85d76a283b",
            "ec__label": "knowCheck",
            "ec__optional": true,
            "ec__options": [
              "Choice 1"
            ],
            "ec__options_answer": [
              "Choice 1"
            ],
            "ec__question": "knowCheck",
            "ec__signer_role": "participant",
            "ec__title": "knowCheck",
            "ec__type": "ec__knowledge_checks",
            "favorite": false,
            "object": "ec__knowledge_check",
            "owner": {
              "_id": "6306a1b610b7f8775736f985",
              "object": "account",
              "path": "/accounts/6306a1b610b7f8775736f985"
            },
            "shared": false
          },
          "id": "31c3fa0c-2ab2-48d2-9d97-6f85d76a283b",
          "type": "knowledgeCheck"
        }
      ]
    },
    "ec__key": "d86ad548-4b78-4bf7-b115-965160b3f1f9",
    "ec__knowledge_checks": {
      "data": [
        {
          "_id": "630fcbf41a3f0b3bba09e98d",
          "access": 7,
          "accessRoles": [
            "000000000000000000000004",
            "000000000000000000000007",
            "000000000000000000000006"
          ],
          "created": "2022-08-31T21:00:36.731Z",
          "creator": {
            "_id": "6306a1b610b7f8775736f985",
            "object": "account",
            "path": "/accounts/6306a1b610b7f8775736f985"
          },
          "ec__answer_context": " ",
          "ec__description": " ",
          "ec__document_template": {
            "_id": "630e6f7228194d6a96fff891",
            "object": "ec__document_template",
            "path": "/ec__document_templates/630e6f7228194d6a96fff891"
          },
          "ec__identifier": "1661979636011-23",
          "ec__key": "31c3fa0c-2ab2-48d2-9d97-6f85d76a283b",
          "ec__label": "knowCheck",
          "ec__optional": true,
          "ec__options": [
            "Choice 1"
          ],
          "ec__options_answer": [
            "Choice 1"
          ],
          "ec__question": "knowCheck",
          "ec__signer_role": "participant",
          "ec__type": "ec__knowledge_checks",
          "favorite": false,
          "object": "ec__knowledge_check",
          "owner": {
            "_id": "6306a1b610b7f8775736f985",
            "object": "account",
            "path": "/accounts/6306a1b610b7f8775736f985"
          },
          "shared": false
        }
      ],
      "hasMore": false,
      "object": "list",
      "path": "/ec__document_templates/630e6f7228194d6a96fff891/ec__knowledge_checks"
    },
    "ec__requested_data": [
      {
        "_id": "630fcb5b1a25d8b04bf939bc",
        "ec__custom_data": [],
        "ec__description": "",
        "ec__key": "c3064e68-5b30-49ae-8a11-9bb0159d86ad",
        "ec__optional": false,
        "ec__signer_role": "participant",
        "ec__title": "text",
        "ec__type": "ec__text"
      },
      {
        "_id": "630fcb801a25d8b04bf94556",
        "ec__custom_data": [],
        "ec__description": "",
        "ec__key": "eb789d2c-81bf-4288-97b0-2f736624ca14",
        "ec__optional": false,
        "ec__signer_role": "participant",
        "ec__title": "num",
        "ec__type": "ec__numeric"
      },
      {
        "_id": "630fcb8a1a25d8b04bf94872",
        "ec__custom_data": [],
        "ec__description": "",
        "ec__key": "574f3e37-4106-47c3-b881-b2a0e6cbceff",
        "ec__optional": false,
        "ec__signer_role": "participant",
        "ec__title": "date",
        "ec__type": "ec__date"
      },
      {
        "_id": "630fcb981a25d8b04bf94c72",
        "ec__custom_data": [],
        "ec__description": "",
        "ec__key": "19c3ccd3-4a87-4d4e-8368-9481fd1363ba",
        "ec__optional": false,
        "ec__signer_role": "participant",
        "ec__title": "email",
        "ec__type": "ec__email"
      },
      {
        "_id": "630fcbae1a25d8b04bf951c1",
        "ec__allow_multiple": true,
        "ec__custom_data": [],
        "ec__description": "",
        "ec__key": "fd6435dd-93c0-4221-9cb8-43e61edfc15d",
        "ec__optional": false,
        "ec__selection_options": "Choice 1=Choice 1",
        "ec__signer_role": "participant",
        "ec__title": "multChoice",
        "ec__type": "ec__text_choice"
      },
      {
        "_id": "630fcbc11a25d8b04bf95732",
        "ec__allow_multiple": false,
        "ec__custom_data": [],
        "ec__description": "",
        "ec__key": "d230fd0e-f25f-4177-9bb8-238ecf6ae9d3",
        "ec__optional": false,
        "ec__selection_options": "Choice 1=Choice 1",
        "ec__signer_role": "participant",
        "ec__title": "singChoice",
        "ec__type": "ec__text_choice"
      }
    ],
    "ec__requested_signatures": [
      {
        "_id": "630fcb1b1a25d8b04bf926bd",
        "ec__custom_data": [],
        "ec__description": "",
        "ec__initials": false,
        "ec__key": "c0d68417-3505-45d9-86ee-433e98bd0e2d",
        "ec__label": "sig",
        "ec__optional": false,
        "ec__order": 0,
        "ec__signer_role": "participant",
        "ec__title": "sig"
      },
      {
        "_id": "630fcb451a25d8b04bf932e8",
        "ec__custom_data": [],
        "ec__description": "",
        "ec__initials": true,
        "ec__key": "4f4464f0-ca95-4667-b1c5-1e3cdb0e0e95",
        "ec__label": "init",
        "ec__optional": false,
        "ec__order": 0,
        "ec__signer_role": "participant",
        "ec__title": "init"
      }
    ],
    "ec__signer_roles": [
      {
        "_id": "630e6f72ab8436c633714612",
        "ec__key": "e6af3ceb-56fa-4733-981c-05f20739017c",
        "ec__order": 1,
        "ec__role": "participant",
        "ec__signer_type": "participant"
      }
    ],
    "ec__status": "draft",
    "ec__title": "template",
    "object": "ec__document_template"
  }

  const org = {
    objects: {
      c_study: {
        find() {
          return {
            paths() {
              return {
                limit() {
                  return {
                    async toArray() {
                      return [{
                        c_key: 'aaa',
                        c_menu_config: [{
                          c_key: 'bbb',
                          c_group_id: '001',
                        }],
                        c_review_types: [{
                          _id: 'rrr',
                          c_key: 'bbb',
                          c_active: true,
                          c_roles: ['xyz']
                        }]
                      }]
                    }
                  }
                }
              }
            }
          }
        }
      },
      org: {
        find() {
          return {
            paths() {
              return {
                limit() {
                  return {
                    async toArray() {
                      return [{
                        roles: [{
                          _id: 'xyz',
                          c_key: 'abc',
                          code: 'admin'
                        }]
                      }]
                    }
                  }
                }
              }
            }
          }
        }
      },
      object: {
        find() {
          return {
            paths() {
              return {
                limit() {
                  return {
                    passive() {
                      return {
                        async toArray() {
                          return [{
                            properties: [{
                              name: 'c_menu_config',
                              properties: [
                                {
                                  name: 'c_group_id',
                                  type: 'String'
                                }
                              ],
                            }]
                          }]
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      c_groups: {
        find(match) {
          const { _id: groupId } = match
          return {
            paths() {
              return {
                limit() {
                  return {
                    async toArray() {
                      if (groupId === '001') {
                        return [{
                          _id: '001',
                          c_key: 'ccc'
                        }]
                      }

                      return []
                    }
                  }
                }
              }
            }
          }
        }
      },
      c_group_tasks: {
        find() {
          return {
            paths() {
              return {
                async toArray() {
                  return [{
                    _id: 'fff',
                    c_key: 'ppp',
                    c_required_reviews: ['rrr']
                  }]
                }
              }
            }
          }
        }
      },
      ec__document_templates: {
        find: () => ({
          paths: () => ({
            toArray: () => ([ecDocTemplate])
          })
        })
      }
    }
  }

  it('menuConfigMapping', async() => {
    const menuConfigMapping = new MenuConfigMap(org),
          mappings = await menuConfigMapping.getMappings()

    expect(mappings)
      .toStrictEqual([
        {
          path: 'c_study.aaa.c_menu_config.bbb.c_group_id',
          mapTo: {
            $pathTo: [
              {
                $dbNext: {
                  object: 'c_group',
                  operation: 'cursor',
                  paths: [
                    '_id'
                  ],
                  where: {
                    c_key: 'ccc'
                  }
                }
              },
              '_id'
            ]
          }
        }
      ])
  })

  describe('MIG-9: Review types mapping', () => {

    it('getStudyReviewMaps', async() => {
      const mapping = new ReviewsTypesMap(org),
            mappings = await mapping.getStudyReviewMaps()

      expect(mappings)
        .toStrictEqual([
          {
            path: 'c_study.aaa.c_review_types.bbb.c_roles',
            mapTo: {
              $dbNext: {
                expressionPipeline: [
                  {
                    $transform: {
                      each: {
                        in: {
                          $map: {
                            as: 'role',
                            in: {
                              $pathTo: [
                                '$$role',
                                '_id'
                              ]
                            },
                            input: {
                              $filter: {
                                as: 'role',
                                cond: {
                                  $in: [
                                    '$$role.code',
                                    {
                                      $array: [
                                        {
                                          $literal: 'admin'
                                        }
                                      ]
                                    }
                                  ]
                                },
                                input: '$$ROOT.roles'
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                ],
                maxTimeMS: 10000,
                object: 'org',
                operation: 'cursor',
                paths: [
                  'roles'
                ]
              }
            }
          }
        ])
    })

    it('getStudyReviewMaps', async() => {
      const mapping = new ReviewsTypesMap(org),
            mappings = await mapping.getGroupTaskReviewMaps()

      expect(mappings)
        .toStrictEqual([
          {
            path: 'c_group_task.ppp.c_required_reviews',
            mapTo: {
              $dbNext: {
                expressionPipeline: [
                  {
                    $transform: {
                      each: {
                        in: {
                          $map: {
                            as: 'reviewType',
                            in: '$$reviewType._id',
                            input: {
                              $filter: {
                                as: 'reviewType',
                                cond: {
                                  $in: [
                                    '$$reviewType.c_key',
                                    {
                                      $array: [
                                        {
                                          $literal: 'bbb'
                                        }
                                      ]
                                    }
                                  ]
                                },
                                input: '$$ROOT.c_review_types'
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                ],
                maxTimeMS: 10000,
                object: 'c_study',
                operation: 'cursor'
              }
            }
          }
        ])
    })
  }),
  describe('MIG-126: econsentDocumentTemplateAdjustments', () => {
    it('getEcBuilderDataMaps', async() => {
      const mapping = new EcBuilderDataMap(org),
            mappings = await mapping.getEcBuilderDataMaps()

      expect(mappings)
        .toStrictEqual([
          {
            path: `ec__document_template.d86ad548-4b78-4bf7-b115-965160b3f1f9.ec__builder_data`,
            mapTo: {
              "$let": {
                "vars": {
                  "originalTemplate": {
                    "$dbNext": {
                      "object": "ec__document_template",
                      "operation": "cursor",
                      "where": {
                        "ec__key": "d86ad548-4b78-4bf7-b115-965160b3f1f9"
                      },
                      "expand": ["ec__knowledge_checks"],
                      "passive": true
                    }
                  }
                },
                "in": {
                  "$object": {
                    "ck-widgets-data": {
                      "$concatArrays": [{
                        "$map": {
                          "input": "$$originalTemplate.ec__requested_signatures",
                          "as": "entry",
                          "in": {
                            "$object": {
                              "data": "$$entry",
                              "id": "$$entry.ec__key",
                              "type": {
                                "$literal": "signature"
                              }
                            }
                          }
                        }
                      }, {
                        "$map": {
                          "input": "$$originalTemplate.ec__knowledge_checks.data",
                          "as": "entry",
                          "in": {
                            "$object": {
                              "data": "$$entry",
                              "id": "$$entry.ec__key",
                              "type": {
                                "$literal": "knowledgeCheck"
                              }
                            }
                          }
                        }
                      }, {
                        "$map": {
                          "input": "$$originalTemplate.ec__requested_data",
                          "as": "entry",
                          "in": {
                            "$object": {
                              "data": "$$entry",
                              "id": "$$entry.ec__key",
                              "type": {
                                "$cond": [
                                  "$$entry.ec__allow_multiple", {
                                    "$literal": "checkboxGroup"
                                  }, {
                                    "$cond": [{
                                      "$eq": ["$$entry.ec__allow_multiple", false]
                                    }, {
                                      "$literal": "radioGroup"
                                    }, {
                                      "$literal": "input"
                                    }]
                                  }]
                              }
                            }
                          }
                        }
                      }]
                    }
                  }
                }
              }
            }
          }
        ])
    })
  })
})
