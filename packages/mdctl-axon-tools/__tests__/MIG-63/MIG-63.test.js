const MenuConfigMap = require('../../lib/mappings/maps/MenuConfigMap')
const ReviewsTypesMap = require('../../lib/mappings/maps/ReviewTypesMap')

describe('MenuConfigMappings', () => {

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
      }
    }
  }

  it('getMappings', async() => {
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
  })
})
