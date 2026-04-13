const logger = require('logger'),
      config = require('config'),
      faults = require('c_fault_lib'),
      http = require('http'),
      moment = require('moment.timezone'),
      StepRepository = require('dt__step_repository'),
      StudyRepository = require('dt__study_repository'),
      TaskRepository = require('dt__task_repository'),
      NotificationRepository = require('dt__notification_repository'),
      SiteRepository = require('dt__site_repository'),
      AccountRepository = require('dt__account_repository'),
      TokenRepository = require('dt__token_repository'),
      PublicUserRepository = require('dt__public_user_repository'),
      DtExecutionRepository = require('dt__execution_repository'),
      AirflowRepository = require('dt__airflow_repository'),
      DtConfigRepository = require('dt__config_repository'),
      EventRepository = require('dt__event_repository'),
      DtExportRepository = require('dt__export_repository'),
      SqlQueryRepository = require('dt__sql_query_repository'),
      FieldService = require('dt__field_service'),
      dagRunFileFormatPerDelimiter = {
        [DtConfigRepository.delimiters.COMMA]: 'csv',
        [DtConfigRepository.delimiters.PIPE]: 'csv-pipe',
        [DtConfigRepository.delimiters.SEMICOLON]: 'csv-semi-colon'
      }

class TransferService {

  static cancelScheduled(dtConfigId) {
    const [dtConfig] = DtConfigRepository.findById(dtConfigId)
    if (!dtConfig) {
      faults.throw('dt.notFound.dataTransferConfig"')
    }
    EventRepository.deleteByKeyPart(dtConfigId)
    DtConfigRepository.updateById(dtConfigId, {
      dt__status: DtConfigRepository.statuses.CANCELLED
    })
  }

  static schedule(dtConfigId) {
    const dtConfig = DtConfigRepository.getById(dtConfigId)
    if (dtConfig.dt__status !== DtConfigRepository.statuses.READY_TO_TRANSFER) return
    try {
      EventRepository.deleteByKeyPart(dtConfig._id)
      const { dt__schedule: schedule } = dtConfig
      if (dtConfig.dt__schedule && dtConfig.dt__schedule.dt__active) {
        EventRepository.createDtEventCronScheduleExpExecution({
          key: dtConfig._id,
          payload: {
            dt__key: dtConfig.dt__key
          },
          startAt: moment.tz(moment(schedule.dt__start_date)
            .format('YYYY-MM-DD HH:mm'), schedule.dt__start_timezone)
            .utc()
            .toDate()
        })
        DtConfigRepository.updateById(dtConfig._id, {
          dt__status: DtConfigRepository.statuses.SCHEDULED_TRANSFER
        })
      } else {
        EventRepository.createDtEventExpExecution({
          key: `${dtConfig._id}__${dtConfig.updated}`,
          payload: {
            dt__key: dtConfig.dt__key
          }
        })
        DtConfigRepository.updateById(dtConfig._id, {
          dt__status: DtConfigRepository.statuses.RUNNING
        })
      }
    } catch (error) {
      DtConfigRepository.updateById(dtConfig._id, {
        dt__status: DtConfigRepository.statuses.ERROR
      })
      throw error
    }
  }

  static scheduleCron(dtConfigKey) {
    const [dtConfig] = DtConfigRepository.findByKey(dtConfigKey)
    if (!dtConfig) return
    try {
      const { dt__schedule: schedule } = dtConfig
      EventRepository.createDtEventExpExecution({
        key: `${dtConfig._id}__${dtConfig.updated}`,
        payload: {
          dt__key: dtConfig.dt__key
        },
        ...(schedule.dt__end_date && {
          expiresAt: moment.tz(moment(schedule.dt__end_date)
            .format('YYYY-MM-DD HH:mm'), schedule.dt__end_timezone || schedule.dt__start_timezone)
            .utc()
            .toDate()
        }),
        ...(schedule.dt__repeat_value && schedule.dt__increment && {
          schedule: this._convertScheduleIncrementToCron(schedule.dt__increment, schedule.dt__repeat_value)
        })
      })
    } catch (error) {
      DtConfigRepository.updateById(dtConfig._id, {
        dt__status: DtConfigRepository.statuses.ERROR
      })
      throw error
    }
  }

  static _convertScheduleIncrementToCron(increment, repeatValue) {
    const startDate = moment.utc(),
          hour = startDate.hour(),
          day = startDate.date(),
          minutes = startDate.minutes()
    switch (increment) {
      case 'hours':
        return `${minutes} */${repeatValue} * * *`
      case 'days':
        return `${minutes} ${hour} */${repeatValue} * *`
      case 'weeks':
        return `${minutes} ${hour} ${day}/${repeatValue * 7} * *`
      case 'months':
        return `${minutes} ${hour} ${day} */${repeatValue} *`
    }
  }

  static start(dtConfigKey) {
    const [dtConfig] = DtConfigRepository.findByKey(dtConfigKey)
    if (!dtConfig) {
      logger.error('dt__event_exp_execution: no config available:', { dtConfigKey })
      return
    }
    const dtExports = DtExportRepository.findActiveByConfigId(dtConfig._id),
          executionStart = new Date(),
          executionDetails = {
            dt__config: dtConfig._id,
            dt__target_used: `${dtConfig.dt__target.dt__target_type || 'SFTP'} ${dtConfig.dt__target.dt__pem_file ? '(SSH PEM)' : ''}`.trim(),
            dt__configured_on: dtConfig.created,
            dt__configured_by: dtConfig.creator._id,
            dt__started: executionStart
          }
    if (!dtExports.length) {
      logger.error('dt__event_exp_execution: no exports available:', { dtConfigKey })
      return
    }
    const bundleName = this._buildFileName(dtConfig.dt__bundle_name, executionStart)
    let dagRun
    try {
      const sqlQueriesPerFilename = dtExports.reduce((sqlQueriesPerFilename, dtExport) => {
              sqlQueriesPerFilename[this._buildFileName(dtExport.dt__filename, executionStart)] = dtExport.dt__type === DtExportRepository.types.LONG
                ? this._buildLongSqlQuery({
                  taskKeys: dtExport.dt__task_keys,
                  stepKeys: dtExport.dt__step_keys,
                  mapping: dtExport.dt__mapping,
                  includeExtractionDate: dtExport.dt__include_extraction_date,
                  defaultTz: dtExport.dt__timezoneFrom
                }) : this._buildWideSqlQuery({
                  taskKeys: dtExport.dt__task_keys,
                  mapping: dtExport.dt__mapping,
                  includeExtractionDate: dtExport.dt__include_extraction_date,
                  defaultTz: dtExport.dt__timezoneFrom
                })
              return sqlQueriesPerFilename
            }, {}),
            token = TokenRepository.createForSqlService()
      dagRun = AirflowRepository.createDagRun(token, {
        dtConfigId: dtConfig._id,
        sqlQueriesPerFilename,
        bundleName,
        manifest: this._getAttachmentContent(dtConfig.dt__included_files),
        protocol: dtConfig.dt__target.dt__target_type.toLowerCase(),
        fileFormat: dagRunFileFormatPerDelimiter[dtConfig.dt__delimiter]
      })
    } catch (error) {
      DtExecutionRepository.create({
        ...executionDetails,
        dt__error: JSON.stringify(error) // TODO: test with error
      })
      this._sendStatusEmail(dtConfig)
      throw error
    }
    const dtExecution = DtExecutionRepository.create({
      ...executionDetails,
      dt__path: `${dtConfig.dt__target.dt__path.replace(/\/?$/, '/')}${bundleName}`,
      dt__dag_run_id: dagRun.dag_run_id
    })
    this._fireCheckDtStateEvent(dtExecution._id)
  }

  static updateStatus(dtExecutionId, retryCount) {
    const [dtExecution] = DtExecutionRepository.findById(dtExecutionId)
    if (!dtExecution) return
    const [dtConfig] = DtConfigRepository.findById(dtExecution.dt__config._id)
    if (!dtConfig) return
    const token = TokenRepository.createForSqlService(),
          dagRun = AirflowRepository.getDagRunById(token, dtExecution.dt__dag_run_id)
    if (!dagRun) return
    if (![AirflowRepository.dagRunStates.FAILED, AirflowRepository.dagRunStates.SUCCESS].includes(dagRun.state)) {
      return this._fireCheckDtStateEvent(dtExecution._id, retryCount + 1)
    }
    const isRunSuccessful = dagRun.state === AirflowRepository.dagRunStates.SUCCESS
    DtExecutionRepository.updateByDagRunId(dtExecution.dt__dag_run_id, {
      dt__status: isRunSuccessful ? DtExecutionRepository.statuses.SUCCESS : DtExecutionRepository.statuses.ERROR
    })
    if (dtConfig.dt__status !== DtConfigRepository.statuses.SCHEDULED_TRANSFER) {
      DtConfigRepository.updateById(dtExecution.dt__config._id, {
        dt__status: isRunSuccessful ? DtConfigRepository.statuses.COMPLETED : DtConfigRepository.statuses.ERROR
      })
    }
    this._sendStatusEmail(dtConfig, isRunSuccessful)
  }

  static _sendStatusEmail(dtConfig, isRunSuccessful) {
    const study = StudyRepository.getCurrent(),
          creator = AccountRepository.getById(dtConfig.creator._id),
          emails = [creator.email, ...dtConfig.dt__notification_emails].filter((value, index, array) => array.indexOf(value) === index)
    for (const recipient of emails) {
      NotificationRepository.sendExecutionStatus({
        completed: isRunSuccessful,
        recipient,
        id: dtConfig.dt__id,
        transferName: dtConfig.dt__name,
        studyName: study.c_name
      })
    }
  }

  static _fireCheckDtStateEvent(dtExecutionId, retryCount = 0) {
    EventRepository.createDtEventAirflowCheckDtDagRunStatus({
      key: `${dtExecutionId}_${retryCount}`,
      payload: {
        retry_count: retryCount,
        dt_execution_id: dtExecutionId
      },
      startAt: new Date(new Date()
        .getTime() + 3 * 60 * 1000)
    })
  }

  static _buildLongSqlQuery(params) {
    const { taskKeys, stepKeys, mapping, includeExtractionDate, defaultTz } = params,
          selectFieldsInfo = this._mapSelectFieldsInfo({
            layoutType: DtExportRepository.types.LONG,
            mapping,
            includeExtractionDate,
            defaultTz
          }),
          whereQuery = this._buildWhereQuery({ taskKeys, stepKeys }),
          selectQuery = this._buildSelectQuery(selectFieldsInfo),
          orderByQuery = this._buildOrderByQuery(DtExportRepository.types.LONG),
          joinQuery = this._buildJoinQuery(DtExportRepository.types.LONG)
    return `
      ${selectQuery}
      from c_step_response
      ${joinQuery}
      cross join unnest(
        if(
          c_step_response.type='c_text_choice',
          cast(json_parse(c_step_response.c_value) as array(varchar)),
          array[c_step_response.c_value]
        )
      ) AS c_step_response(unnested_c_value)
      ${whereQuery}
      ${orderByQuery}
    `
  }

  static _mapSelectFieldsInfo(params) {
    const { layoutType, mapping, includeExtractionDate, defaultTz } = params,
          selectFieldsInfo = mapping
            .map(mappingFieldConfig => ({
              field: this._mapQuerySelectFieldInfo(layoutType, mappingFieldConfig, defaultTz),
              alias: mappingFieldConfig.label
            }))

    if (!includeExtractionDate) {
      return selectFieldsInfo
    }
    return [
      ...selectFieldsInfo,
      {
        field: this._arbitraryIfWideLayout(layoutType, this._formatSelectDateField('current_timestamp')),
        alias: 'EXTDTC'
      }
    ]
  }

  static _buildWideSqlQuery(params) {
    const { taskKeys, mapping, includeExtractionDate, defaultTz } = params,
          selectFieldsInfo = this._mapSelectFieldsInfo({
            layoutType: DtExportRepository.types.WIDE,
            mapping,
            includeExtractionDate,
            defaultTz
          }),
          whereQuery = this._buildWhereQuery({ taskKeys }),
          selectQuery = this._buildSelectQuery(selectFieldsInfo),
          orderByQuery = this._buildOrderByQuery(DtExportRepository.types.WIDE),
          joinQuery = this._buildJoinQuery(DtExportRepository.types.WIDE)
    return `
      ${selectQuery}
      from c_task_response
      ${joinQuery}
      ${whereQuery}
      group by c_task_response.id
      ${orderByQuery}
   `
  }

  static _buildSelectQuery(selectFieldsInfo) {
    return `select ${selectFieldsInfo.map(selectFieldInfo => `${selectFieldInfo.field} as "${selectFieldInfo.alias}"`)
      .join(', ')}`
  }

  static _buildQueryLimit(limit) {
    return ` limit ${limit}`
  }

  static _buildWhereQuery(keys) {
    const { taskKeys, stepKeys } = keys,
          taskIds = TaskRepository.findIdsByKeys(taskKeys),
          testDataFilterIds = config.get('test_data_ids_to_exclude'),
          filters = [
            // TODO try filtering by c_key directly
            this._buildWhereIn('c_task.id', taskIds)
          ]
    if (stepKeys) {
      const stepIds = StepRepository.findIdsByKeys(stepKeys)
      // TODO try filtering by c_key directly
      filters.push(this._buildWhereIn('c_step.id', stepIds))
    }
    if (testDataFilterIds) {
      if (Array.isArray(testDataFilterIds.participantIds)) {
        const publicUserIds = PublicUserRepository.findAllIdsExceptIds(testDataFilterIds.participantIds)
        filters.push(`(${this._buildWhereIn('c_public_user.id', publicUserIds)} or c_public_user.id is null)`)
      }
      if (Array.isArray(testDataFilterIds.siteIds)) {
        const siteIds = SiteRepository.findAllIdsExceptIds(testDataFilterIds.siteIds)
        filters.push(`(${this._buildWhereIn('c_site.id', siteIds)} or c_site.id is null)`)
      }
    }
    return ` where ${filters.join(' and ')}`
  }

  static _buildWhereIn(field, values) {
    return `${field} in ('${values.join("','")}')`
  }

  static _buildSeqSelectFieldInfo(layoutType, defaultTz) {
    let partitionBy, orderBy
    if (layoutType === DtExportRepository.types.LONG) {
      partitionBy = [
        'c_step_response.c_task',
        'c_step_response.c_public_user',
        'c_step_response.c_step',
        // INFO: for row_number to return 1 if c_step_response.c_end_date is null
        `if(
          c_step_response.c_end_date is null, 
          c_step_response.id, 
          ${this._formatSelectDateField('c_step_response.c_end_date', defaultTz, { params: { date: 'YYYY-MM-DD' } })}
        )`
      ]
      orderBy = 'c_step_response.c_start_date'
    } else {
      partitionBy = [
        'arbitrary(c_task_response.c_task)',
        'arbitrary(c_task_response.c_public_user)',
        // INFO: for row_number to return 1 if c_task_response.c_end is null
        `arbitrary(
          if(
            c_task_response.c_end is null, 
            c_task_response.id, 
            ${this._formatSelectDateField('c_task_response.c_end', defaultTz, { params: { date: 'YYYY-MM-DD' } })}
          )
        )`
      ]
      orderBy = 'arbitrary(c_task_response.c_start)'
    }
    return `row_number() over (partition by ${partitionBy.join(',')} order by ${orderBy})`
  }

  // https://trino.io/docs/current/functions/datetime.html#mysql-date-functions
  static _formatSelectDateField(field, defaultTz, format = {}) {
    const tz = (format.params && format.params.tz) || defaultTz,
          selectDateFieldTz = tz === DtExportRepository.tz.UTC ? `'UTC'` : `coalesce(c_task_response.c_tz, c_site.c_tz, 'UTC')`
    let customDatetimeFormat
    if (format.params) {
      if (format.params.date) {
        const dateFormatMapping = {
          'YYYY': '%Y',
          'MM': '%m',
          'MMM': '%b',
          'DD': '%d'
        }
        customDatetimeFormat = format.params.date.replace(/YYYY|MM(?!M)|MMM|DD/g, item => dateFormatMapping[item])
      }
      if (format.params.time) {
        const timeFormatMapping = {
                'HH': '%H',
                'mm': '%i',
                'ss.sss': '%s',
                'ss': '%s'
              },
              customTimeFormat = format.params.time.replace(/HH|mm|ss.sss|ss/g, item => timeFormatMapping[item])
        customDatetimeFormat = customDatetimeFormat ? `${customDatetimeFormat} ${customTimeFormat}` : customTimeFormat
      }
    }
    const selectDateFieldDatetimeFormat = customDatetimeFormat || '%Y-%m-%dT%H:%i:%s'
    return `date_format(at_timezone(${field}, ${selectDateFieldTz}), '${selectDateFieldDatetimeFormat}')`
  }

  static _mapQuerySelectFieldInfo(layoutType, mappingFieldConfig, defaultTz) {
    const { field, type, expression, format } = mappingFieldConfig,
          fieldPaths = field ? field.split('.') : []
    if (type === FieldService.customFieldTypes.SEQ) {
      return this._buildSeqSelectFieldInfo(layoutType, defaultTz)
    }
    if (layoutType === DtExportRepository.types.LONG) {
      if (mappingFieldConfig.type === FieldService.customFieldTypes.RESULTC) {
        return this._buildResultcSelectField()
      }
      if (field === 'c_step_response.c_value') {
        return this._formatSelectStepResponseValueField(defaultTz)
      }
      if (field === 'c_step.c_question') {
        return this._removeHtmlTagsFromSelectStringField(
          this._localizeSelectStringField(fieldPaths[0], fieldPaths[1])
        )
      }
    } else {
      if (mappingFieldConfig.type === FieldService.customFieldTypes.STEP_RESPONSE_VALUE_PER_STEP_NAME) {
        const stepId = mappingFieldConfig.expression.$cond[2].$cond[0].$eq[0].$pathTo[0].$find.cond.$eq[1].$toObjectId
        return this._buildSelectStepValuePerStepNameField(stepId, defaultTz)
      }
    }
    if (type === FieldService.customFieldTypes.LITERAL) {
      return this._arbitraryIfWideLayout(
        layoutType,
        `'${expression.$literal}'`
      )
    }
    if (type === 'Date') {
      return this._arbitraryIfWideLayout(
        layoutType,
        this._formatSelectDateField(field, defaultTz, format)
      )
    }
    if (field.includes('._id')) {
      return this._arbitraryIfWideLayout(
        layoutType,
        field.replace('._id', '.id')
      )
    }
    if (field === 'c_group.c_sequence') {
      return this._arbitraryIfWideLayout(
        layoutType,
        this._buildSelectGroupSequenceField()
      )
    }
    if (fieldPaths.length === 3 && type === 'String') {
      return this._arbitraryIfWideLayout(
        layoutType,
        this._localizeSelectStringField(
          fieldPaths[0],
          `${fieldPaths[1]}.${fieldPaths[2]}`,
          this._extractSelectNestedStringField(fieldPaths[0], fieldPaths[1], fieldPaths[2])
        )
      )
    }
    if (fieldPaths.length === 3) {
      return this._arbitraryIfWideLayout(
        layoutType,
        this._extractSelectNestedStringField(fieldPaths[0], fieldPaths[1], fieldPaths[2])
      )
    }
    if (fieldPaths[1] === 'c_name') {
      return this._arbitraryIfWideLayout(
        layoutType,
        this._localizeSelectNameField(field)
      )
    }
    if (fieldPaths.length === 2 && type === 'String') {
      return this._arbitraryIfWideLayout(
        layoutType,
        this._localizeSelectStringField(fieldPaths[0], fieldPaths[1])
      )
    }
    return this._arbitraryIfWideLayout(layoutType, field)
  }

  static _arbitraryIfWideLayout(layoutType, field) {
    if (layoutType === DtExportRepository.types.LONG) {
      return field
    }
    return `arbitrary(${field})`
  }

  static _removeHtmlTagsFromSelectStringField(field) {
    return `regexp_replace(${field}, '<[^>]*>')`
  }

  static _buildFileName(nameTemplate, date) {
    const outputPerToken = {
            YYYY: date.getUTCFullYear(),
            MMM: new Intl.DateTimeFormat('en-US', { month: 'short' })
              .format(new Date(date))
              .toUpperCase(),
            MM: this._formatDateNumber(date.getMonth() + 1),
            DD: this._formatDateNumber(date.getUTCDate()),
            HH: this._formatDateNumber(date.getUTCHours()),
            mm: this._formatDateNumber(date.getUTCMinutes()),
            ss: this._formatDateNumber(date.getUTCSeconds())
          },
          tokens = Object.keys(outputPerToken)
    return nameTemplate.replace(/{([a-zA-Z-_:]+)}/g, (match, bracketsContent) => tokens
      .reduce((output, key) => output.replace(key, outputPerToken[key]), bracketsContent))
  }

  static _formatDateNumber(number) {
    return ('0' + number).slice(-2)
  }

  static _buildSelectStepValuePerStepNameField(stepId, defaultTz) {
    const stepResponseValue = this._sanitizePersonalDataFromSelectField(`
      if(
        c_step_response.type in ('c_date', 'c_datetime'),
        ${this._formatSelectDateField(`from_iso8601_timestamp(replace(c_step_response.c_value, '"'))`, defaultTz)},
        if(
          c_step_response.type='c_text_choice',
          array_join(cast(json_parse(c_step_response.c_value) as array(varchar)), ', '),
          c_step_response.c_value
        )
      )
    `)
    return `array_agg(${stepResponseValue}) filter (where c_step_response.c_step='${stepId}')[1]`
  }

  static _buildSelectGroupSequenceField() {
    const defaultSequenceValue = config.get('dt__default_c_group_sequence_value')
    return `if(c_group.c_sequence is null, ${defaultSequenceValue ? `'${defaultSequenceValue}'` : null}, cast(cast(c_group.c_sequence as int) as varchar))`
  }

  static _formatSelectStepResponseValueField(defaultTz) {
    return this._sanitizePersonalDataFromSelectField(`
      if(
        c_step_response.type in ('c_date', 'c_datetime'), 
        ${this._formatSelectDateField(`from_iso8601_timestamp(replace(c_step_response.unnested_c_value, '"'))`, defaultTz)}, 
        c_step_response.unnested_c_value
      )
    `)
  }

  static _sanitizePersonalDataFromSelectField(field) {
    return `if(c_step.c_personal_data=True, null, ${field})`
  }

  static _buildResultcSelectField() {
    const field = `
      if(
        c_step.c_type='text_choice',
        coalesce(
          json_value(
            c_step.locales, 
            'lax $.c_text_choices[*]?(@._id == $text_choice_id).c_text?(@.locale == "en_US").value'
            passing json_value(
              c_step.c_text_choices, 
              'lax $[*]?(@.c_value == $text_choice_value)._id' 
              passing c_step_response.unnested_c_value as "text_choice_value"
            ) as "text_choice_id"
          ), 
          json_value(
            c_step.c_text_choices, 
            'lax $[*]?(@.c_value == $text_choice_value).c_text' 
            passing c_step_response.unnested_c_value as "text_choice_value"
          )
        ), 
        null
      )`.replace(/(\n)|\s{2,}/g, '')
    return this._sanitizePersonalDataFromSelectField(field)
  }

  static _getAttachmentContent(attachmentsInfo) {
    if (!attachmentsInfo.length) return
    const manifestInfo = attachmentsInfo[0]
    if (manifestInfo.filename.split('.')[1] !== 'json') return
    if (!manifestInfo.url) return
    const result = http.get(manifestInfo.url)
    return result.body
  }

  static _localizeSelectStringField(tableName, pathToLocalizedValue, defaultValue = `${tableName}.${pathToLocalizedValue}`) {
    return `coalesce(json_value(${tableName}.locales, 'lax $.${pathToLocalizedValue}[*]?(@.locale == "en_US").value'), ${defaultValue})`
  }

  static _localizeSelectNameField(field) {
    return `coalesce(${field}, ${field}_en)`
  }

  static _extractSelectNestedStringField(tableName, fieldName, nestedPath) {
    return `json_extract_scalar(${tableName}.${fieldName}, '$.${nestedPath}')`
  }

  static _buildOrderByQuery(layoutType) {
    let fields = [
      'c_site.c_number',
      'c_public_user.c_number',
      'c_task_response.c_start',
      this._localizeSelectNameField('c_task.c_name')
    ]
    if (layoutType === DtExportRepository.types.WIDE) {
      fields = [
        ...fields,
        'c_task_response.created'
      ]
      fields = fields.map(field => `arbitrary(${field})`)
    } else {
      fields = [
        ...fields,
        this._localizeSelectNameField('c_step.c_name'),
        'c_step_response.created'
      ]
    }
    return ` order by ${fields.join(',')}`
  }

  static _buildJoinQuery(layoutType) {
    const objectRelationsSchema = FieldService.getObjectRelationsSchema()
    return objectRelationsSchema
      .reduce((join, item) => {
        const layoutConfig = layoutType === DtExportRepository.types.WIDE ? item.wide : item.long
        if (layoutConfig && layoutConfig.join) {
          join += ` left join ${item.object} on ${item.object}.${layoutConfig.join.field}=${layoutConfig.join.join_field}`
        }
        return join
      }, '')
  }

  static preview(params) {
    const {
            dt__task_keys,
            dt__step_keys,
            dt__timezoneFrom = DtExportRepository.tz.PATIENT,
            dt__mapping = [],
            dt__type: type = DtExportRepository.types.LONG,
            dt__include_extraction_date,
            limit = 20
          } = params,
          steps = StepRepository.findByKeys(dt__step_keys),
          previewMapping = dt__mapping.length ? dt__mapping : FieldService.getDefaultPreviewFields(type, steps, dt__timezoneFrom)
    let query = type === DtExportRepository.types.LONG ? this._buildLongSqlQuery({
      taskKeys: dt__task_keys,
      stepKeys: dt__step_keys,
      mapping: previewMapping,
      includeExtractionDate: dt__include_extraction_date,
      defaultTz: dt__timezoneFrom
    }) : this._buildWideSqlQuery({
      taskKeys: dt__task_keys,
      mapping: previewMapping,
      includeExtractionDate: dt__include_extraction_date,
      defaultTz: dt__timezoneFrom
    })
    if (limit) {
      query += this._buildQueryLimit(limit)
    }
    const token = TokenRepository.createForSqlService(),
          result = SqlQueryRepository.execute(token, query)
    return {
      mapping: previewMapping,
      list: result.data
    }
  }

}

module.exports = TransferService