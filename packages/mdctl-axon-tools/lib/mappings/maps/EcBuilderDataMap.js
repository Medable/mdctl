/* eslint-disable one-var */
module.exports = class EcBuilderDataMap {

  constructor(org) {
    this.org = org
  }

  async getEcBuilderDataMaps(consentIds = []) {
    const mapping = []
    let ecTemplates
    if (consentIds && consentIds.length) {
      ecTemplates = await this.org.objects.ec__document_templates
        .find({ _id: { $in: consentIds } })
        .limit(false)
        .paths('ec__key', 'ec__builder_data', 'ec__requested_data', 'ec__requested_signatures', 'ec__knowledge_checks')
        .toArray()
    } else {
      ecTemplates = await this.org.objects.ec__document_templates
        .find()
        .limit(false)
        .paths('ec__key', 'ec__builder_data', 'ec__requested_data', 'ec__requested_signatures', 'ec__knowledge_checks')
        .toArray()
    }

    ecTemplates = ecTemplates
      .filter(template => template.ec__builder_data
              && !!template.ec__builder_data['ck-widgets-data']
              && !!template.ec__builder_data['ck-widgets-data'].length)

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
                          ec__key: '$$entry.ec__key',
                          _id: '$$entry._id'
                        }
                      }
                    }
                  }, {
                    $map: {
                      input: '$$originalTemplate.ec__knowledge_checks.data',
                      as: 'entry',
                      in: {
                        $object: {
                          ec__key: '$$entry.ec__key',
                          _id: '$$entry._id'
                        }
                      }
                    }
                  }, {
                    $map: {
                      input: '$$originalTemplate.ec__requested_data',
                      as: 'entry',
                      in: {
                        $object: {
                          ec__key: '$$entry.ec__key',
                          _id: '$$entry._id'
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

  async getMappings(consentIds = []) {
    return [
      ...await this.getEcBuilderDataMaps(consentIds)
    ]
  }


}
