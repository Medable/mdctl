const { flatten, uniqBy, uniq, isEqual, orderBy } = require('lodash'),
      cache = require('cache'),
      config = require('config'),
      FieldRepository = require('dt__field_repository'),
      DtExportRepository = require('dt__export_repository'),
      StepRepository = require('dt__step_repository'),
      OrgRepository = require('dt__org_repository'),
      DataTransferFormats = require('dt__datatransferformats'),
      CACHE_TIME = 86400,
      qsFieldLabels = {
        STUDYID: 'STUDYID',
        DOMAIN: 'DOMAIN',
        SITEID: 'SITEID',
        SUBJID: 'SUBJID',
        QSCAT: 'QSCAT',
        QSSEQ: 'QSSEQ',
        QSORRESU: 'QSORRESU',
        QSSTRESC: 'QSSTRESC',
        VISIT: 'VISIT',
        QSDTC: 'QSDTC',
        QSENDTC: 'QSENDTC',
        QSTESTCD: 'QSTESTCD',
        QSTEST: 'QSTEST',
        QSORRES: 'QSORRES',
        VISITNUM: 'VISITNUM',
        QSRESULTC: 'QSRESULTC',
        QSSCAT: 'QSSCAT',
        QSMETHOD: 'QSMETHOD',
        QSEVLINT: 'QSEVLINT',
        QSEVINTX: 'QSEVINTX',
        QSEVAL: 'QSEVAL'
      },
      qsFieldLabelsToFieldPaths = {
        [qsFieldLabels.STUDYID]: 'c_study.c_name',
        [qsFieldLabels.SITEID]: 'c_site.c_number',
        [qsFieldLabels.SUBJID]: 'c_public_user.c_number',
        [qsFieldLabels.QSCAT]: 'c_task.c_name',
        [qsFieldLabels.QSORRESU]: 'c_step.c_unit',
        [qsFieldLabels.QSSTRESC]: 'c_step.c_text',
        [qsFieldLabels.VISIT]: 'c_visit.c_name',
        [qsFieldLabels.QSDTC]: 'c_task_response.c_start',
        [qsFieldLabels.QSENDTC]: 'c_task_response.c_end',
        [qsFieldLabels.QSTESTCD]: 'c_step.c_name',
        [qsFieldLabels.QSTEST]: 'c_step.c_mappings.c_cdash',
        [qsFieldLabels.QSSCAT]: 'c_step.c_mappings.c_subcategory',
        [qsFieldLabels.QSMETHOD]: 'c_step.c_mappings.c_method',
        [qsFieldLabels.QSEVLINT]: 'c_step.c_mappings.c_evaluation_interval',
        [qsFieldLabels.QSEVINTX]: 'c_step.c_mappings.c_evaluation_interval_text',
        [qsFieldLabels.QSEVAL]: 'c_step.c_mappings.c_evaluator',
        [qsFieldLabels.QSORRES]: 'c_step_response.c_value',
        [qsFieldLabels.VISITNUM]: 'c_group.c_sequence'
      },
      previewFieldPathsPerFormatType = {
        [DtExportRepository.types.LONG]: [
          qsFieldLabelsToFieldPaths.STUDYID,
          qsFieldLabelsToFieldPaths.SITEID,
          qsFieldLabelsToFieldPaths.SUBJID,
          qsFieldLabelsToFieldPaths.QSTESTCD,
          qsFieldLabelsToFieldPaths.QSTEST,
          qsFieldLabelsToFieldPaths.QSCAT,
          qsFieldLabelsToFieldPaths.QSORRES,
          qsFieldLabelsToFieldPaths.QSORRESU,
          qsFieldLabelsToFieldPaths.QSSTRESC,
          qsFieldLabelsToFieldPaths.VISITNUM,
          qsFieldLabelsToFieldPaths.VISIT,
          qsFieldLabelsToFieldPaths.QSDTC,
          qsFieldLabelsToFieldPaths.QSENDTC
        ],
        [DtExportRepository.types.WIDE]: [
          qsFieldLabelsToFieldPaths.STUDYID,
          qsFieldLabelsToFieldPaths.SITEID,
          qsFieldLabelsToFieldPaths.SUBJID,
          qsFieldLabelsToFieldPaths.QSCAT,
          qsFieldLabelsToFieldPaths.VISITNUM,
          qsFieldLabelsToFieldPaths.VISIT,
          qsFieldLabelsToFieldPaths.QSDTC,
          qsFieldLabelsToFieldPaths.QSENDTC
        ]
      },
      qsFieldPathsToFieldLabels = Object.entries(qsFieldLabelsToFieldPaths)
        .reduce((res, key) => {
          res[key[1]] = key[0]
          return res
        }, {}),
      DEFAULT_DOMAIN = 'QS'

class FieldService {

  static customFieldTypes = {
    LITERAL: 'LITERAL',
    RESULTC: 'RESULTC',
    SEQ: 'SEQ',
    STEP_RESPONSE_VALUE_PER_STEP_NAME: 'STEP_RESPONSE_VALUE_PER_STEP_NAME'
  }

  static piiPhiProperties = [
    'account.email',
    'account.name',
    'account.dob',
    'account.password',
    'account.key',
    'account.mobile',
    'account.username',
    'account.c_health_data',
    'c_public_user.c_email',
    'c_public_user.c_mobile',
    'c_public_user.c_participant_name_or_email',
    'c_health_datum',
    'ec__document_invite.c_email',
    'ec__signed_document.ec__final_document',
    'ec__signed_document.ec__signature_invites'
  ]

  static getObjectRelationsSchema() {
    const customObjectRelationsSchema = config.get('dt__schema_extension'),
          // TODO set in dt__schema_extension as default value?
          defaultObjectRelationsSchema = [
            {
              object: 'c_public_user',
              wide: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_task_response.c_public_user'
                }
              },
              long: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_step_response.c_public_user'
                }
              }
            },
            {
              object: 'c_task',
              wide: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_task_response.c_task'
                }
              },
              long: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_step_response.c_task'
                }
              }
            },
            {
              object: 'c_study',
              wide: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_task_response.c_study'
                }
              },
              long: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_step_response.c_study'
                }
              }
            },
            {
              object: 'c_group',
              wide: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_task_response.c_group'
                }
              },
              long: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_step_response.c_group'
                }
              }
            },
            {
              object: 'c_task_response',
              wide: {
                display_fields: true
              },
              long: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_step_response.c_task_response'
                }
              }
            },
            {
              object: 'c_site',
              wide: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_task_response.c_site'
                }
              },
              long: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_step_response.c_site'
                }
              }
            },
            {
              object: 'c_step_response',
              wide: {
                display_fields: false,
                join: {
                  field: 'c_task_response',
                  join_field: 'c_task_response.id'
                }
              },
              long: {
                display_fields: true
              }
            },
            {
              object: 'c_step',
              wide: {
                display_fields: false,
                join: {
                  field: 'id',
                  join_field: 'c_step_response.c_step'
                }
              },
              long: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_step_response.c_step'
                }
              }
            },
            {
              object: 'c_visit',
              wide: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'c_task_response.c_visit'
                }
              },
              long: {
                display_fields: true,
                join: {
                  field: 'id',
                  join_field: 'coalesce(c_step_response.c_visit, c_task_response.c_visit)'
                }
              }
            }
          ]
    return defaultObjectRelationsSchema.concat(customObjectRelationsSchema)
  }

  static _getObjectNamesPerLayoutType() {
    const objectRelationsSchema = this.getObjectRelationsSchema(),
          [objectNamesForWideLayout, objectNamesForLongLayout] = objectRelationsSchema
            .reduce(([namesForWideLayout, namesForLongLayout], item) => {
              if (item.wide && item.wide.display_fields) {
                namesForWideLayout.push(item.object)
              }
              if (item.long && item.long.display_fields) {
                namesForLongLayout.push(item.object)
              }
              return [namesForWideLayout, namesForLongLayout]
            }, [[], []])
    return {
      wide: objectNamesForWideLayout,
      long: objectNamesForLongLayout
    }
  }

  static _getObjectPropertyFieldsPerLayoutType() {
    const objectPropertyFields = cache.get('dt__object_property_fields'),
          objectsPerLayoutType = this._getObjectNamesPerLayoutType()
    if (
      objectPropertyFields &&
        isEqual(objectPropertyFields.objects.wide, objectsPerLayoutType.wide) &&
        isEqual(objectPropertyFields.objects.long, objectsPerLayoutType.long)
    ) {
      return objectPropertyFields.fields
    }

    const objects = uniq([
            ...objectsPerLayoutType.wide,
            ...objectsPerLayoutType.long
          ]),
          paths = FieldRepository.findForObjects(objects),
          propertyFieldsPerObject = paths.reduce((obj, item) => {
            const filteredProps = [
              { '_id': item._id || null },
              ...item.properties,
              ...flatten(item.objectTypes.map(o => o.properties))
            ]
            obj[item.name] = uniqBy(
              flatten(this._buildObjectPropertyField(item.label, item.name, filteredProps))
                .filter(p => !['Reference', 'List', 'File'].includes(p.type) && !this.piiPhiProperties.includes(p.field)),
              'field'
            )
              .map(item => ({
                ...item,
                label: qsFieldPathsToFieldLabels[item.field] || item.label
              }))
            return obj
          }, {}),
          objectPropertyFieldsPerLayoutType = {
            wide: flatten(objectsPerLayoutType.wide.map(objectName => propertyFieldsPerObject[objectName])),
            long: flatten(objectsPerLayoutType.long.map(objectName => propertyFieldsPerObject[objectName]))
          }
    cache.set('dt__object_property_fields', {
      objects: objectsPerLayoutType,
      fields: objectPropertyFieldsPerLayoutType
    }, CACHE_TIME)
    return objectPropertyFieldsPerLayoutType
  }

  static _buildObjectPropertyField(objectLabel, objectName, properties, parentProperties) {
    return properties.map(property => {
      if (property.properties) {
        return this._buildObjectPropertyField(objectLabel, objectName, property.properties, property)
      }
      if (property._id) {
        return { type: 'ObjectId', field: `${objectName}._id`, label: `${objectLabel} - ID` }
      }
      return parentProperties
        ? {
          type: property.type,
          field: `${objectName}.${parentProperties.name}.${property.name}`,
          label: `${objectLabel} - ${parentProperties.label} - ${property.label}`
        }
        : {
          type: property.type,
          field: `${objectName}.${property.name}`,
          label: `${objectLabel} - ${property.label}`
        }
    })
  }

  static getDefaultPreviewFields(layoutType, steps, timezoneFrom) {
    const fieldsPerLayoutType = this._getObjectPropertyFieldsPerLayoutType(),
          previewMapping = fieldsPerLayoutType[layoutType]
            .filter(item => previewFieldPathsPerFormatType[layoutType].indexOf(item.field) > -1)
            .sort(
              (item1, item2) =>
                previewFieldPathsPerFormatType[layoutType].indexOf(item1.field) - previewFieldPathsPerFormatType[layoutType].indexOf(item2.field)
            )
    previewMapping.splice(1, 0, this._buildDomainField())
    previewMapping.splice(4, 0, this._buildSeq())
    if (layoutType === DtExportRepository.types.WIDE && steps.length) {
      previewMapping.splice(6, 0, ...this._buildStepsFields(layoutType, steps, timezoneFrom))
    }
    return previewMapping
  }

  static getAllFields(layoutType, stepIds, timezoneFrom) {
    const fieldsPerLayoutType = this._getObjectPropertyFieldsPerLayoutType(),
          steps = StepRepository.findByIds(stepIds)
    return [
      ...(layoutType === DtExportRepository.types.LONG && [
        this._buildResultcField(),
        ...fieldsPerLayoutType.long
      ]),
      ...(layoutType === DtExportRepository.types.WIDE && [
        ...(steps.length && this._buildStepsFields(layoutType, steps, timezoneFrom)),
        ...fieldsPerLayoutType.wide
      ]),
      this._buildDomainField(),
      this._buildSeq()
    ]
  }

  // TODO replace expression with value as MongoDB is not longer used directly
  static _buildDomainField() {
    return {
      expression: {
        $literal: DEFAULT_DOMAIN
      },
      label: qsFieldLabels.DOMAIN,
      // to be correctly displayed in the column list on UI
      field: qsFieldLabels.DOMAIN,
      type: this.customFieldTypes.LITERAL
    }
  }

  static _buildSeq() {
    return {
      label: qsFieldLabels.QSSEQ,
      field: qsFieldLabels.QSSEQ,
      type: this.customFieldTypes.SEQ
    }
  }

  static _buildResultcField() {
    return {
      label: qsFieldLabels.QSRESULTC,
      field: qsFieldLabels.QSRESULTC,
      type: this.customFieldTypes.RESULTC
    }
  }

  // TODO: remove expression as MongoDB is not longer used directly
  static _buildStepsFields(type, steps, timezoneFrom) {
    const apps = OrgRepository.getApps()
      .map(a => ({ name: a.name, key: a.clients[0].key }))
    return orderBy(steps, ['c_task._id', 'c_order'])
      .map((s) => ({
        label: s.c_mappings ? s.c_mappings.c_cdash || s.c_name : s.c_name,
        field: s.c_name,
        type: this.customFieldTypes.STEP_RESPONSE_VALUE_PER_STEP_NAME,
        expression: {
          $cond: [
            `${s.c_personal_data ? '1' : ''}`,
            '',
            {
              $cond: [
                {
                  $eq: [{
                    $pathTo: [{
                      $find: {
                        input: '$$ROOT.steps',
                        as: 's',
                        cond: {
                          $eq: [{ $pathTo: ['$$s', 'id._id'] }, { $toObjectId: s._id }]
                        }
                      }
                    }, 'type']
                  }, 'c_datetime']
                },
                {
                  $moment: [
                    {
                      $pathTo: [{
                        $find: {
                          input: '$$ROOT.steps',
                          as: 's',
                          cond: {
                            $eq: [{ $pathTo: ['$$s', 'id._id'] }, { $toObjectId: s._id }]
                          }
                        }
                      }, 'value']
                    },
                    { tz: (DataTransferFormats.getPatientTimeZone(apps, timezoneFrom, type)) },
                    { 'format': '' }
                  ]
                },
                {
                  $pathTo: [{
                    $find: {
                      input: '$$ROOT.steps',
                      as: 's',
                      cond: {
                        $eq: [{ $pathTo: ['$$s', 'id._id'] }, { $toObjectId: s._id }]
                      }
                    }
                  }, 'value']
                }
              ]
            }
          ]
        }
      }))
  }

}

module.exports = FieldService