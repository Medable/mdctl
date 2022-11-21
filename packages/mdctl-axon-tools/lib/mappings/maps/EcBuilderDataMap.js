/* eslint-disable one-var */
module.exports = class EcBuilderDataMap {

  constructor(org) {
    this.org = org
  }

  async getEcBuilderDataMaps() {

    const mapping = []

    let ecTemplates = await this.org.objects.ec__document_templates
      .find({ ec__status: 'draft' })
      .paths('ec__key', 'ec__builder_data', 'ec__requested_data', 'ec__requested_signatures', 'ec__knowledge_checks')
      .toArray()

    ecTemplates = ecTemplates.filter(template => template.ec__builder_data && !!template.ec__builder_data['ck-widgets-data'].length)

    // eslint-disable-next-line no-restricted-syntax
    for (const template of ecTemplates) {
      const builderDataKeys = template.ec__builder_data['ck-widgets-data']
        .map(datum => datum.data.ec__key)
        .filter(key => !!key)

      // eslint-disable-next-line no-continue
      if (!builderDataKeys.length) continue

      mapping.push({
        path: `ec__document_template.${template.ec__key}.ec__builder_data`,
        mapTo: {
          $let: {
            vars: {
              originalTemplate: {
                $dbNext: {
                  object: 'ec__document_template',
                  operation: 'cursor',
                  where: {
                    ec__key: template.ec__key
                  },
                  expand: ['ec__knowledge_checks'],
                  passive: true
                }
              }
            },
            in: {
              $object: {
                'ck-widgets-data': {
                  $concatArrays: [{
                    $map: {
                      input: '$$originalTemplate.ec__requested_signatures',
                      as: 'entry',
                      in: {
                        $object: {
                          data: '$$entry',
                          id: '$$entry.ec__key',
                          type: {
                            $literal: 'signature'
                          }
                        }
                      }
                    }
                  }, {
                    $map: {
                      input: '$$originalTemplate.ec__knowledge_checks.data',
                      as: 'entry',
                      in: {
                        $object: {
                          data: '$$entry',
                          id: '$$entry.ec__key',
                          type: {
                            $literal: 'knowledgeCheck'
                          }
                        }
                      }
                    }
                  }, {
                    $map: {
                      input: '$$originalTemplate.ec__requested_data',
                      as: 'entry',
                      in: {
                        $object: {
                          data: '$$entry',
                          id: '$$entry.ec__key',
                          type: {
                            $cond: [
                              '$$entry.ec__allow_multiple', {
                                $literal: 'checkboxGroup'
                              }, {
                                $cond: [{
                                  $eq: ['$$entry.ec__allow_multiple', false]
                                }, {
                                  $literal: 'radioGroup'
                                }, {
                                  $literal: 'input'
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
      })
    }
    return mapping
  }

  async getMappings() {
    return [
      ...await this.getEcBuilderDataMaps()
    ]
  }


}
