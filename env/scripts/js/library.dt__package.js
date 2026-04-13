/**
 * @fileOverview
 * @summary Data Transfer Package
 * @version 1.0.0
 *
 * @author Admin Tool Squad
 *
 * @example
 * const { Package } = require('dt__package')
 */
const { route, on, as } = require('decorators'),
      logger = require('logger'),
      faults = require('c_fault_lib'),
      expressions = require('expressions'),
      TransferService = require('dt__transfer_service'),
      DtExportRepository = require('dt__export_repository'),
      FieldService = require('dt__field_service'),
      ConfigService = require('dt__config_service'),
      DataTransferFormats = require('dt__datatransferformats'),
      DTConfig = require('dt__config')

/**
 * DataTransfer Package.
 * @class Package
 */
class Package {

  /* ROUTES */

    /**
     * Route to get a list of available formats operators to use.
     * @memberOf Package
     * @path {GET} /data-transfers/formats
     * @response {Object} data
     * @response {Array} data.formats Array of available formats.
     * @response {Array} data.presets Array of preset values.
     * @example
     * curl 'https://api-int-dev.medable.com/data-transfers/v2/routes/data-transfers/formats'
     */
    @route('GET /data-transfers/formats', {
      name: 'dt__formats',
      acl: 'role.dt__admin',
      authValidation: 'all'
    })
  static getFormats() {
    const { formats, presets } = DataTransferFormats
    return { formats, presets }
  }

    /**
     * Route to get a list of available fields to use.
     * @memberOf Package
     * @path {GET} /data-transfers/fields
     * @response {Object} data
     * @response {Array} data.fields Array of available fields.
     * @example
     * curl 'https://api-int-dev.medable.com/data-transfers/v2/routes/data-transfers/fields?type'
     */
    @route('GET /data-transfers/fields', {
      name: 'dt__fields',
      acl: 'role.dt__admin',
      authValidation: 'all'
    })
    static getDefaultFields({ req }) {
      // Reading stepIds to fetch computed fields in Wide format
      let stepIds = []
      if (req.query.stepIds) { stepIds = req.query.stepIds.split(',') }

      return FieldService.getAllFields(
        req.query.type || DtExportRepository.types.LONG,
        stepIds,
        req.query.timezoneFrom || DtExportRepository.tz.PATIENT
      )
    }

    /**
     * Route to get a preview data list based on payload config
     * @memberOf Package
     * @path {POST} /data-transfers/preview
     * @query {Boolean} [onlyExpression=false] when true will return mapping and expression only.
     * @body {String} studyId Study Id
     * @body {Array} taskIds List of c_task._id
     * @body {Array} stepIds List of c_step._id
     * @body {String} [type=long] Data layout wide|long.
     * @body {Array} mappings list of mapping configurations.
     * @response {Object} data
     * @response {Object} [data.expr] Expression used to extract data.
     * @response {Array} data.mapping Array of mapping information.
     * @response {Array} data.list Items returned from the expression execution.
     * @example
     * curl 'https://api-int-dev.medable.com/data-transfers/v2/routes/data-transfers/preview' \
     * --data-raw '{"dt__task_keys":["6081b3ae4a9b830100166d84"],"dt__step_keys":["6081b3ae4a9b830100166d83","6082e914e5938b01007dead4","6081af32096d7601002f3253"],"dt__type":"wide","dt__mapping":[{"literal":"DS000123124PET","label":"STUDY"},{"literal":"SGRQ IPF","label":"QSCAT"},{"literal":" -P7D","label":"QSEVLINT"},{"literal":"PAST 7 DAYS","label":"QSCEVINT"}]}'
     */
    @route('POST /data-transfers/preview', {
      name: 'dt__preview',
      acl: 'role.dt__admin',
      authValidation: 'all'
    })
    @as('dt__service', { principal: { skipAcl: true, grant: 'read' }, safe: false })
    static preview({ req, body }) {
      const payload = body()
      this._validatePreviewInput(payload, req.query)
      return TransferService.preview({
        ...payload,
        ...(req.query.limit & { limit: Number(req.query.limit) })
      })
    }

    @route('GET /data-transfers/study', {
      name: 'dt__getStudyInfo',
      acl: 'role.dt__admin',
      authValidation: 'all'
    })
    @as('dt__service', { principal: { skipAcl: true, grant: 'read' }, safe: false })
    static getStudyInfo() {
      return ConfigService.getStudyInfo()
    }

    /**
     * Return one execution item.
     * @memberOf Package
     * @path {GET} /data-transfers/executions/:id
     * @params {String} :id DTExecution _id
     * @response {DTExecution} data DTExecution instance.
     * @example
     * curl 'https://api-int-dev.medable.com/data-transfers/v2/routes/data-transfers/executions/6081b3ae4a9b830100166d84'
     */
    @route('GET /data-transfers/executions/:id', {
      name: 'dt__execution',
      acl: 'role.dt__admin',
      authValidation: 'all'
    })
    static getOneExecution({ req }) {
      const [dt__execution] = org.objects.dt__execution.find({ _id: req.params.id })
      if (!dt__execution) {
        faults.throw('dt.notFound.noExecutionFound')
      }
      return dt__execution
    }

    /**
     * Route to return a single data transfer config.
     * @memberOf Package
     * @path {GET} /data-transfers/:id
     * @params {String} :id DT Config _id
     * @response {DTConfig} data DTConfig instance object + exports
     * @example
     * curl 'https://api-int-dev.medable.com/data-transfers/v2/routes/data-transfers/6081b3ae4a9b830100166d84'
     */
    @route('GET /data-transfers/:id', {
      name: 'dt__config_return',
      acl: 'role.dt__admin',
      authValidation: 'all'
    })
    static getConfig({ req }) {
      const dt__config = DTConfig.getConfig(req.params.id)
      if (!dt__config) {
        throw faults.throw('dt.notFound.noDataTransferConfigFound')
      }

      const exports = org.objects.dt__export.find({ 'dt__config._id': dt__config._id })
        .paths(
          'dt__filename',
          'dt__format',
          'dt__mapping',
          'dt__step_keys',
          'dt__task_keys',
          'dt__type',
          'dt__timezoneFrom',
          'dt__include_extraction_date',
          'dt__active'
        )
        .toArray()
      return { dt__config, exports }

    }

    /**
     * Cancel scheduled transfer
     * @memberOf Package
     * @path {PUT} /data-transfers/:id/cancel
     * @params {String} :id DTExecution _id
     * @example
     * curl -X PUT 'https://api-int-dev.medable.com/data-transfers/v2/routes/data-transfers/6081b3ae4a9b830100166d8f/cancel'
     */
    @route('PUT /data-transfers/:id/cancel', {
      name: 'dt__cancel_scheduled',
      acl: 'role.dt__admin',
      authValidation: 'all'
    })
    static cancelScheduled({ req }) {
      return TransferService.cancelScheduled(req.params.id)
    }

    /**
     * Return the list of executions for a given config
     * @memberOf Package
     * @path {GET} /data-transfers/:id/executions
     * @params {String} :id DTConfig _id
     * @response {Array} data list of exections
     * @example
     * curl 'https://api-int-dev.medable.com/data-transfers/v2/routes/data-transfers/6081b3ae4a9b830100166d84/executions'
     */
    @route('GET /data-transfers/:id/executions', {
      name: 'dt__exections_list',
      acl: 'role.dt__admin',
      authValidation: 'all'
    })
    static getAllExecutions({ req }) {
      return expressions.pipeline.run([
        {
          $cursor: {
            operation: 'cursor',
            object: 'dt__execution',
            skipAcl: true,
            grant: 4,
            where: {
              'dt__config': req.params.id
            },
            sort: { _id: -1 }
          }
        }, {
          $transform: {
            vars: {
              config: null,
              creator: null,
              updater: null,
              configuredBy: null
            },
            each: {
              set: {
                config: {
                  $dbNext: [{
                    $object: {
                      object: 'dt__config',
                      where: {
                        _id: '$$ROOT.dt__config._id'
                      }
                    }
                  }, 60]
                },
                creator: {
                  $dbNext: [{
                    $object: {
                      object: 'account',
                      skipAcl: true,
                      grant: 4,
                      where: {
                        _id: '$$config.creator._id'
                      },
                      paths: { $literal: ['name'] }
                    }
                  }, 60]
                },
                updater: {
                  $dbNext: [{
                    $object: {
                      object: 'account',
                      skipAcl: true,
                      grant: 4,
                      where: {
                        _id: '$$config.updater._id'
                      },
                      paths: { $literal: ['name'] }
                    }
                  }, 60]
                },
                configuredBy: {
                  $dbNext: [{
                    $object: {
                      object: 'account',
                      where: {
                        _id: '$$ROOT.dt__configured_by._id'
                      },
                      paths: { $literal: ['name'] }
                    }
                  }, 60]
                }
              },
              in: {
                $mergeObjects: ['$$ROOT', {
                  $object: {
                    dt__config: '$$config',
                    dt__configuredBy: {
                      $ifNull: ['$$configuredBy', { $ifNull: ['$$updater', '$$creator'] }]
                    }
                  }
                }]
              }
            }
          }
        }, {
          $project: {
            'dt__started': '$$ROOT.dt__started',
            'dt__ended': '$$ROOT.dt__ended',
            'dt__target_used': { $ifNull: ['$$ROOT.dt__target_used', 'SFTP'] },
            'dt__path': { $ifNull: ['$$ROOT.dt__path', { $ifNull: ['$$ROOT.dt__config.dt__target.dt__path', '$$ROOT.dt__config.dt__sftp_target.dt__path'] }] },
            'dt__configured_by': '$$ROOT.dt__configuredBy',
            'dt__configured_on': { $ifNull: ['$$ROOT.dt__configured_on', '$$ROOT.dt__config.updated'] },
            'copy_url': '$$ROOT.dt__copy.url',
            'dt__status': '$$ROOT.dt__status'
          }
        }
      ])
    }

    /**
     * Route to return all data transfers config.
     * @memberOf Package
     * @path {GET} /data-transfers
     * @response {Array} data list of data transfers.
     * @example
     * curl 'https://api-int-dev.medable.com/data-transfers/v2/routes/data-transfers'
     */
    @route('GET /data-transfers', {
      name: 'dt__config_return_all',
      acl: 'role.dt__admin',
      authValidation: 'all'
    })
    static getAllConfigs({ req }) {
      const lastId = req.query.lastId || 1000000000,
            perPage = req.query.perPage || 50,
            dateFormat = 'DD MMM YYYY HH:mm',
            expPipeline = [
              {
                $cursor: {
                  'object': 'dt__config',
                  'operation': 'cursor',
                  where: {
                    'dt__id': { $lt: lastId }
                  },
                  paths: [
                    'dt__id',
                    'creator',
                    'updater',
                    'updated',
                    'created',
                    'dt__status',
                    'dt__schedule',
                    'dt__name',
                    'dt__bundle_name'
                  ],
                  sort: { created: -1 },
                  limit: perPage

                }
              }, {
                $transform: {
                  vars: {
                    creatorAccount: null,
                    updatedBy: null,
                    numExecutions: null,
                    lastTransfer: null,
                    lastSucceedTransfer: null,
                    nextTransfer: null
                  },
                  each: {
                    set: {
                      numExecutions: {
                        $dbNext: [
                          {
                            $object: {
                              'object': 'dt__execution',
                              'pipeline': {
                                $array: [
                                  {
                                    $object: {
                                      '$match': {
                                        'dt__config._id': '$$ROOT._id',
                                        'dt__status': 'SUCCESS'
                                      }
                                    }
                                  },
                                  {
                                    $literal: {
                                      '$group': {
                                        '_id': null,
                                        'total': {
                                          '$sum': 1
                                        }
                                      }
                                    }
                                  },
                                  {
                                    $literal: {
                                      '$project': {
                                        'total': 1
                                      }
                                    }
                                  }
                                ]
                              }
                            }
                          },
                          60
                        ]
                      },
                      creatorAccount: {
                        $dbNext: [
                          {
                            $object: {
                              object: 'account',
                              skipAcl: true,
                              grant: 'read',
                              where: { _id: '$$ROOT.creator._id' },
                              paths: { $literal: ['name'] }
                            }
                          },
                          60
                        ]
                      },
                      updatedBy: {
                        $dbNext: [
                          {
                            $object: {
                              object: 'account',
                              skipAcl: true,
                              grant: 'read',
                              where: { _id: '$$ROOT.updater._id' },
                              paths: { $literal: ['name'] }
                            }
                          },
                          60
                        ]
                      },
                      lastSucceedTransfer: {
                        $dbNext: [{
                          $object: {
                            'object': 'dt__execution',
                            'pipeline': {
                              $array: [
                                {
                                  $object: {
                                    '$match': {
                                      'dt__config._id': '$$ROOT._id',
                                      'dt__status': 'SUCCESS'
                                    }
                                  }
                                },
                                {
                                  $literal: {
                                    '$sort': {
                                      'created': -1
                                    }
                                  }
                                },
                                {
                                  $literal: {
                                    '$limit': 1
                                  }
                                }
                              ]
                            }
                          }
                        }, 60]
                      },
                      lastTransfer: {
                        $dbNext: [{
                          $object: {
                            'object': 'dt__execution',
                            'pipeline': {
                              $array: [
                                {
                                  $literal: {
                                    '$sort': {
                                      'created': -1
                                    }
                                  }
                                },
                                {
                                  $object: {
                                    '$match': {
                                      'dt__config._id': '$$ROOT._id',
                                      'created': { $object: { '$gte': { $ifNull: ['$$ROOT.updated', '$$ROOT.created'] } } }
                                    }
                                  }
                                },
                                {
                                  $literal: {
                                    '$limit': 1
                                  }
                                }
                              ]
                            }
                          }
                        }, 60]
                      },
                      nextTransfer: {
                        $cond: [
                          {
                            $and: [
                              { $in: [ '$$ROOT.dt__status', { $array: [ 'SCHEDULED_TRANSFER', 'RUNNING', 'READY_TO_TRANSFER' ] } ] },
                              { $eq: ['$$ROOT.dt__schedule.dt__active', true] }
                            ]
                          },
                          {
                            $cond: [
                              '$$lastTransfer',
                              {
                                $moment: [
                                  '$$lastTransfer.dt__started',
                                  { tz: { $ifNull: ['$$ROOT.dt__schedule.dt__start_timezone', 'UTC'] } },
                                  {
                                    add: [
                                      { $ifNull: ['$$ROOT.dt__schedule.dt__repeat_value', 0] },
                                      { $ifNull: ['$$ROOT.dt__schedule.dt__increment', 'hours'] }
                                    ]
                                  },
                                  {
                                    format: dateFormat
                                  }
                                ]
                              },
                              {
                                $concat: [
                                  {
                                    $moment: [
                                      '$$ROOT.dt__schedule.dt__start_date',
                                      {
                                        format: dateFormat
                                      }
                                    ]
                                  },
                                  {
                                    $ifNull: [{
                                      $moment: [
                                        '$$ROOT.dt__schedule.dt__start_date',
                                        {
                                          tz: {
                                            $ifNull: ['$$ROOT.dt__schedule.dt__start_timezone', 'UTC']
                                          }
                                        },
                                        {
                                          // TODO: is it necessary?
                                          format: 'z'
                                        }
                                      ]
                                    }, 'UTC']
                                  }
                                ]
                              }
                            ]
                          },
                          null
                        ]
                      }
                    },
                    in: {
                      $mergeObjects: ['$$ROOT', {
                        $object: {
                          creator: '$$creatorAccount',
                          updater: '$$updatedBy',
                          executions: { $ifNull: ['$$numExecutions.total', 0] },
                          lastTransfer: {
                            $cond: ['$$lastSucceedTransfer.dt__started', {
                              $moment: [
                                '$$lastSucceedTransfer.dt__started',
                                {
                                  tz: { $ifNull: ['$$ROOT.dt__schedule.dt__start_timezone', 'UTC'] }
                                },
                                {
                                  format: dateFormat
                                }
                              ]
                            }, null]
                          },
                          nextTransfer: '$$nextTransfer'
                        }
                      }]
                    }
                  }
                }
              }, {
                $project: {
                  _id: '$$ROOT._id',
                  dt__key: '$$ROOT.dt__id',
                  creator: '$$ROOT.creator',
                  updater: '$$ROOT.updater',
                  executions: '$$ROOT.executions',
                  lastTransfer: '$$ROOT.lastTransfer',
                  nextTransfer: '$$ROOT.nextTransfer',
                  dt__status: '$$ROOT.dt__status',
                  dt__name: '$$ROOT.dt__name',
                  dt__bundle_name: '$$ROOT.dt__bundle_name'
                }
              }
            ]
      return expressions.pipeline.run(expPipeline)
    }

    /* EVENTS */

    /**
     * Event to execute a data transfer configuration.
     * @memberOf Package
     * @param {Object} params Parameters store in an event configuration { dt__key }
     */
    @on('dt__event_exp_execution')
    @as('dt__service', { principal: { skipAcl: true, grant: 'read' }, safe: false })
    static executeConfigEvent(params) {
      logger.debug('dt__event_exp_execution', params)
      TransferService.start(params.dt__key)
    }

    @on('dt__event_cron_schedule_exp_execution')
    @as('dt__service', { principal: { skipAcl: true, grant: 'read' }, safe: false })
    static scheduleCron(params) {
      logger.debug('dt__event_cron_schedule_exp_execution', params)
      TransferService.scheduleCron(params.dt__key)
    }

    @on('dt__event_airflow_check_dt_dag_run_status')
    @as('dt__service', { principal: { skipAcl: true, grant: 'read' }, safe: false })
    static updateDataTransferStatus(params) {
      logger.debug('dt__event_airflow_check_dt_dag_run_status', params)
      TransferService.updateStatus(params.dt_execution_id, params.retry_count)
    }

    static _validatePreviewInput(previewBody, previewQuery) {
      const { dt__task_keys, dt__step_keys } = previewBody,
            { limit } = previewQuery
      if (!Array.isArray(dt__task_keys) || !dt__task_keys.length) {
        throw faults.throw('dt.invalidArgument.dt__task_keys')
      }

      if (!Array.isArray(dt__step_keys) || !dt__step_keys.length) {
        throw faults.throw('dt.invalidArgument.dt__step_keys')
      }

      if (limit && !/^[1-9][0-9]*$/.test(limit)) {
        throw faults.throw('dt.invalidArgument.limit')
      }
    }

}

module.exports = {
  Package
}