const MenuConfigMapping = require('../../lib/mappings/MenuConfigMapping')

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
    }
  }

  it('getMappings', async() => {
    const menuConfigMapping = new MenuConfigMapping(org),
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

  it('getMappingScript', async() => {
    const menuConfigMapping = new MenuConfigMapping(org),
          script = await menuConfigMapping.getMappingScript(),

          expectedScript = `
const { run } = require('expressions')

const mappings = [{"path":"c_study.aaa.c_menu_config.bbb.c_group_id","mapTo":{"$pathTo":[{"$dbNext":{"object":"c_group","operation":"cursor","paths":["_id"],"where":{"c_key":"ccc"}}},"_id"]}}]

mappings.forEach(({ path, mapTo }) => {
  const [entity, entityKey, property, ...rest] = path.split('.'),
      isDocPropUpdate = !!rest.length,
      value = run(mapTo)

  if (isDocPropUpdate) {
    const [entityResult] = org.objects[entity]
      .find({ c_key: entityKey })
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
})`

    expect(script)
      .toBe(expectedScript)
  })
})
