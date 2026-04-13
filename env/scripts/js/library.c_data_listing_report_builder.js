import nucUtils from 'c_nucleus_utils'
import logger from 'logger'
import { isNewSiteUser } from 'c_dmweb_reports_generator'

const { transform, profile } = require('decorators')
const moment = require('moment')
const { paths, profiler } = require('util')
const { debug, error } = require('logger')
const { run: runExpression } = require('expressions')
const { executeSqlQuery } = require('c_sql_queries_handler')

if (script.env.name === 'development') {
  profiler.enabled = true

  script.on('exit', () => {
    const report = profiler.report()
    const isEmpty = Object.keys(report).length === 0
    if (!isEmpty) {
      debug('PROFILER', report)
    }
  })
}

function deepClone(object) {
  return JSON.parse(JSON.stringify(object))
}

function isObject(object) {
  return typeof object === 'object' && !Array.isArray(object)
}

const ENVIRONMENT_VARIABLES = {
  $ACCOUNT_LEVEL_ROLES: Object.keys(consts.roles)
    .filter((key) => {
      const rolesLabel = [
        'administrator',
        'support',
        'developer',
        'provider',
        'c_data_export',
        'c_data_manager',
        'c_data_reviewer',
        'c_dm_app',
        'c_principal_data_manager',
        'c_study_designer'
      ]

      return rolesLabel.includes(key)
    })
    .map((key) => {
      return consts.roles[key]
    }),

  $ROLES: Object.keys(consts.roles)
    .filter((name) => {
      const [initialLetter] = name.split('')

      return initialLetter === initialLetter.toUpperCase()
    })
    .reduce((acc, name) => {
      acc.push({ _id: consts.roles[name], name })

      return acc
    }, []),

  // define one env variable for each role
  ...Object.keys(consts.roles)
    .filter((key) => {
      const rolesLabel = ['administrator', 'developer', 'support', 'provider']

      return rolesLabel.includes(key) || key.startsWith('c_')
    })
    .reduce((acc, key) => {
      return { ...acc, [`$${key.toUpperCase()}`]: consts.roles[key] }
    }, {})
}

module.exports = class {

  report = {
    c_title: '',
    c_description: '',
    c_key: '',
    c_pdf_template: '',
    c_pdf_exportable: false,
    c_csv_exportable: true,
    c_xls_exportable: false,
    c_data: org.objects.bulk(),
    c_transformation: org.objects.bulk(),
    c_headers: [],
    c_config: {
      c_headers_reading: [],
      c_headers_writing: [],
      c_roles: []
    },
    c_reading: []
  };

  setRequiredPackages(packages) {
    this.report.c_required_packages = packages
    return this
  }

  isDataStageProvisioned() {
    const { ops } = this.report.c_data.getOptions()
    return !!ops.length
  }

  setKey(key) {
    this.report.c_key = key
    return this
  }

  setTitle(title) {
    this.report.c_title = title
    return this
  }

  setDescription(description) {
    this.report.c_description = description
    return this
  }

  addDataStages(dataStages) {
    // this is the general stage index, counts the number of stages and pathRead stages in the same counter
    let stageIdx = 0

    dataStages.forEach((dataStage) => {
      if (dataStage.pathRead) {
        let stage = 0
        dataStage.pathRead.forEach((currentStage, idx) => {
          if (stage > 0) {
            const previousStage = dataStage.pathRead[idx - 1]

            const [initialStage] = dataStage.pathRead

            const {
              c_aggregation,
              object,
              expressionPipeline,
              previousStageName
            } = currentStage

            const previousObject = previousStageName || previousStage.object

            const cursor = org.objects[object]
              .aggregate([
                {
                  $match: {
                    [previousObject]: { $exists: true }
                  }
                },
                ...c_aggregation
              ])
              .skipAcl()
              .grant(consts.accessLevels.read)

            if (expressionPipeline) {
              cursor.expressionPipeline(expressionPipeline)
            }

            cursor.transform({
              autoPrefix: true,
              script: 'dl__data_stage',
              memo: { initialStage, previousStage, currentStage, stageIdx }
            })

            this.report.c_data.add(cursor, { wrap: false })

            stageIdx++
          } else {
            this.addDataStages([currentStage])
          }

          stage++
        })
      } else {
        const { object, c_aggregation, skipAcl, grant, expressionPipeline } =
          dataStage

        const cursor = org.objects[object].aggregate(c_aggregation)
          .transform({
            autoPrefix: true,
            script: 'dl__data_stage',
            memo: { stageIdx }
          })

        if (skipAcl) {
          cursor.skipAcl(skipAcl)
        }

        if (grant) {
          cursor.grant(grant)
        }

        if (expressionPipeline) {
          cursor.expressionPipeline(expressionPipeline)
        }

        this.report.c_data.add(cursor, { wrap: false })

        stageIdx++
      }
    })

    return this
  }

  addExpressionPipeline(expressionPipeline) {
    this.report.c_report_cursor = org.objects.accounts
      .find()
      .limit(1)
      .expressionPipeline(expressionPipeline)
      .transform({
        autoPrefix: true,
        script: 'dl__report_next',
        memo: {
          // can pass other memos if needed
        }
      })
      .getOptions()

    return this
  }

  addSQLQuery(sqlQuery, values) {
    this.report.c_report_cursor = org.objects.accounts
      .find()
      .limit(1)
      .transform({
        autoPrefix: true,
        script: 'dl__sql_query',
        memo: {
          sqlQuery,
          values
        }
      })
      .getOptions()

    return this
  }

  addTransformationStage(transformationStage) {
    const transformCursor = org.objects.OOs.aggregate([
      { $match: { c_type: transformationStage.c_entity } }
    ])
      // eslint-disable-next-line no-template-curly-in-string
      .prefix('${ooDumpName}/list')
      .transform({
        autoPrefix: true,
        memo: {
          currentStage: transformationStage
        },
        script: transformationStage.script || 'dl__transformation_stage'
      })

    this.report.c_transformation.add(transformCursor, { wrap: false })

    return this
  }

  setReportNext() {
    this.report.c_report_next = true
    return this
  }

  installOnlyOnAts() {
    this.report.c_ats_version = true
    return this
  }

  installOnlyOnNonAts() {
    this.report.c_ats_version = false
    return this
  }

  specifyMinPackageVersions(minPackageVersions) {
    this.report.c_min_package_versions = minPackageVersions
    return this
  }

  addReadingStage(readingPipeline) {
    this.report.c_reading = readingPipeline
    return this
  }

  addHeaders(headers) {
    headers.forEach((header) => {
      const {
        c_config: { c_headers_reading, c_headers_writing }
      } = this.report

      c_headers_reading.push(header.c_read_config)

      c_headers_writing.push(header.c_write_config)

      delete header.c_read_config
      delete header.c_write_config

      this.report.c_headers.push(header)
    })

    return this
  }

  setRoles(roles) {
    this.report.c_config.c_roles = roles.filter(role => consts.roles[role])
    return this
  }

  toCortexObject() {
    const clonedReport = deepClone(this.report)

    clonedReport.c_data = this.report.c_data.getOptions()

    clonedReport.c_transformation = this.report.c_transformation.getOptions()

    return clonedReport
  }

  createReport() {
    const reportObject = this.toCortexObject()

    const reportFound = org.objects.c_dmweb_reports
      .find({ c_key: this.report.c_key })
      .hasNext()

    return script.as('c_system_user', {}, () => {
      if (reportFound) {
        return org.objects.c_dmweb_reports
          .updateOne({ c_key: reportObject.c_key }, { $set: reportObject })
          .execute()
      } else {
        return org.objects.c_dmweb_reports.insertOne(reportObject)
          .execute()
      }
    })
  }

}

@transform('dl__data_stage')
class DataStageTransform {

  readPreviousEntity(ooName, matchClause) {
    const [previousEntity] = org.objects.OOs.aggregate([
      matchClause,
      {
        $limit: 1
      }
    ])
      .prefix(ooName + '/list')
      .toArray()

    return previousEntity
  }

  pushNewData(ooName, dataToPush) {
    org.objects.OOs.updateOne(
      {
        name: ooName
      },
      {
        $push: dataToPush
      }
    )
      .pathPrefix('list')
      .execute()
  }

  @profile
  each(object, { ooDumpName, initialStage, currentStage, previousStage }) {
    let entity = object

    let pathPrefix = entity._id
    let findPathPrefix

    if (previousStage) {
      const { previousStageName } = currentStage

      const previousObject = previousStageName || previousStage.object

      const previousKey = Object.keys(object)
        .find(
          (key) => key === previousObject
        )

      const previousValueId = object[previousKey]._id

      const matchClause = {
        $match: {
          c_type: previousStage.object,
          c_entity_id: previousValueId
        }
      }

      // NOTE: Here we read all elements in a collection and we  verify if there is such previous entity (continues...)
      const previousEntity = this.readPreviousEntity(ooDumpName, matchClause)

      // if not then it means the user doesn't have access to it therefore we ignore it
      if (!previousEntity) return

      // if user has new site user role and initial object is set to c_site then change it to account, coz new site user can;t read c_sites directly
      if (
        isNewSiteUser(script.principal.roles) &&
        (initialStage.object === 'c_site' || initialStage.object === 'c_sites')
      ) {
        if (
          !previousEntity.c_path.includes(`${script.principal._id}/c_sites`)
        ) {
          findPathPrefix =
            `${script.principal._id}/c_sites/` +
            previousEntity.c_path +
            '/' +
            currentStage.c_entity +
            '/' +
            object._id
        } else {
          findPathPrefix =
            previousEntity.c_path +
            '/' +
            currentStage.c_entity +
            '/' +
            object._id
        }

        initialStage.object = 'account'
      } else {
        findPathPrefix =
          previousEntity.c_path +
          '/' +
          currentStage.c_entity +
          '/' +
          object._id
      }
      pathPrefix =
        previousEntity.c_path + '/' + currentStage.c_entity + '/' + object._id
      try {
        entity = org.objects[initialStage.object]
          .aggregate(currentStage.c_aggregation)
          .prefix(findPathPrefix)
          .next()
      } catch (err) {
        console.error(`[Data Transform] failed to get ${pathPrefix}`)
        console.error(`[Data Transform] error is: ${err.toString()}`)
      }
    }

    if (entity) {
      const dataToPush = {
        c_type: entity.object,
        c_object: entity,
        c_path: pathPrefix,
        c_entity_id: entity._id
      }
      this.pushNewData(ooDumpName, dataToPush)
    }

    return ooDumpName
  }

}

@transform('dl__transformation_stage')
class TransformationStageTransform {

  transformsByType = {
    String: (value) => {
      return String(value || '')
    },

    Number: (value) => {
      return Number(value || 0)
    },

    Date: (value) => {
      if (!value) return ''

      const date = moment(value)

      return date.isValid() ? date.toISOString() : ''
    }
  };

  generateNewRow(cols, headers, headersWriting) {
    return headers.reduce((obj, curr, idx) => {
      let value = cols[idx] || '' // default to empty string

      const writingConfig = headersWriting[idx]

      if (writingConfig && writingConfig[value]) {
        value = writingConfig[value]
      }

      const transformedValue = this.transformsByType[curr.type](value)

      const extended = { ...obj, [curr.name]: transformedValue }

      return extended
    }, {})
  }

  // replaces template variables in object
  replaceTemplate(object, entity) {
    if (Array.isArray(object)) {
      object.forEach((element) => this.replaceTemplate(element, entity))
    } else if (isObject(object)) {
      const keys = Object.keys(object)

      keys.forEach((key) => {
        const curr = object[key]

        if (curr && typeof curr === 'string') {
          if (curr.startsWith('$')) {
            const [variable, ...path] = curr.split('.')

            const content =
              variable === '$THIS'
                ? entity
                : ENVIRONMENT_VARIABLES[variable] || {}

            const stringifiedPath = path.join('.')

            if (stringifiedPath) {
              object[key] = paths.to(content, stringifiedPath)
            } else {
              // if it is not a path then set the whole object at this node
              object[key] = content
            }
          }
        } else if (isObject(curr)) {
          this.replaceTemplate(curr, entity)
        }
      })
    }
  }

  getConfig(readingConfig, entity) {
    let config

    if (readingConfig.length === 1) {
      config = readingConfig[0]
    } else {
      config = readingConfig.find((c) => {
        if (c.c_when) {
          const [path] = Object.keys(c.c_when)

          const whenConditionValue = paths.to(entity, path)

          return (
            whenConditionValue &&
            String(whenConditionValue) === String(c.c_when[path])
          )
        }
      })
    }

    // can be undefined
    return config
  }

  needsToRun(ifCondition, entity) {
    if (ifCondition) {
      const ifCopy = deepClone(ifCondition) // make sure we don't replace values on the original

      let { expression, context } = ifCopy

      // this is in case context is just $THIS
      if (!isObject(context) && typeof context === 'string') {
        context = { value: context }

        this.replaceTemplate(context, entity)

        return !!runExpression(expression, deepClone(context.value))
      }

      this.replaceTemplate(context, entity)

      // enforce a boolean result
      return !!runExpression(expression, deepClone(context))
    }

    return true
  }

  resolveExpression(config, entity) {
    const {
      object,
      skipAcl,
      grant,
      expressionPipeline,
      c_aggregation,
      scriptAs
    } = config

    const aggregationCopy = deepClone(c_aggregation)

    this.replaceTemplate(aggregationCopy, entity)

    const cursor = this.buildCursor({
      object,
      skipAcl,
      grant,
      c_aggregation: aggregationCopy,
      expressionPipeline
    })

    if (scriptAs) {
      const wrapper = { scriptAs }

      this.replaceTemplate(wrapper, entity)

      entity = script.as(wrapper.scriptAs, {}, () => cursor.toArray())
    } else {
      entity = cursor.toArray()
    }

    return entity
  }

  buildCursor({
    object,
    skipAcl,
    grant,
    c_aggregation,
    prefix,
    expressionPipeline
  }) {
    // if user has new site user role and cursorObject is set to c_site then change it to account, coz new site user can;t read c_sites directly
    if (isNewSiteUser(script.principal.roles) && (object === 'c_site' || object === 'c_sites')) {
      object = 'account'
      prefix = prefix || ''
      prefix =
        prefix && prefix.includes(`${script.principal._id}/c_sites`)
          ? prefix
          : `${script.principal._id}/c_sites/${prefix}`
    }
    const cursor = org.objects[object].aggregate(c_aggregation)

    if (expressionPipeline) {
      expressionPipeline.forEach((stage) => {
        if (stage.$transform && stage.$transform.vars) {
          // we need to see if they need replacement with ENVIRONMENT_VARIABLES

          const vars = deepClone(stage.$transform.vars)

          Object.keys(vars)
            .forEach((key) => {
              let curr = vars[key]

              if (!curr) return

              this.replaceTemplate(curr, {})

              if (!curr.$literal) {
                curr = { $literal: curr }
              }
            })

          stage.$transform.vars = vars
        }
      })

      cursor.expressionPipeline(expressionPipeline)
    }

    if (skipAcl) {
      cursor.skipAcl()
    }

    if (grant) {
      cursor.grant(grant)
    }

    if (prefix) {
      cursor.prefix(prefix)
    }

    return cursor
  }

  getValueFromWhere(config, entity) {
    const { c_prefix, c_where, c_value } = config.c_clause

    let arr = c_prefix ? paths.to(entity, c_prefix) : entity

    if (!Array.isArray(arr)) {
      arr = [] // make sure that it is always an array, default to empty array
    }

    const found = arr.find((subEntity) => {
      const wherePaths = Object.keys(c_where)

      const isMatch = wherePaths
        .map((path) => {
          const value = String(paths.to(subEntity, path))

          const expectedValueIdentifier = c_where[path]

          const [isRef, ...referencedPathArr] =
            expectedValueIdentifier.split('.')

          let expectedValue

          // the expected value is obtained from the current object
          if (isRef && isRef === '$THIS') {
            const referencedPath = referencedPathArr.join('.')

            expectedValue = String(paths.to(entity, referencedPath))
          } else {
            expectedValue = String(expectedValueIdentifier)
          }

          return value === expectedValue
        })
        .reduce((acc, curr) => acc * curr)

      return Boolean(isMatch)
    })

    return found ? this.evaluateCValue(found, c_value) : ''
  }

  getValue(config, entity) {
    const {
      c_clause: { c_where, c_value },
      type
    } = config

    if (type === 'expression') {
      entity = this.resolveExpression(config, entity)
    } else if (type === 'bulk-expression') {
      const { ops } = config

      // flatten results
      entity = ops.reduce(
        (acc, op) => [...acc, ...this.resolveExpression(op, entity)],
        []
      )
    }

    let result

    if (c_where) {
      result = this.getValueFromWhere(config, entity)
    } else {
      result = this.evaluateCValue(entity, c_value)
    }

    const unwrappedResult = Array.isArray(result) ? result[0] : result

    return unwrappedResult
  }

  evaluateCValue(entity, c_value) {
    if (isObject(c_value)) {
      const { expression, context } = deepClone(c_value)

      this.replaceTemplate(context, entity)

      const result = runExpression(expression, deepClone(context))

      return result
    }

    return paths.to(entity, c_value)
  }

  generateCols(headersReading, entity) {
    return headersReading.map((readingConfig) => {
      const $THIS = deepClone(entity)

      const config = this.getConfig(readingConfig, $THIS)

      // if no config found to read the data
      if (!config) {
        return
      }

      const { c_if } = config

      if (!this.needsToRun(c_if, $THIS)) {
        return
      }

      return this.getValue(config, $THIS)
    })
  }

  @profile
  each(
    object,
    { currentStage, ooTableName, headers, c_headers_writing, c_headers_reading }
  ) {
    const { c_path, c_entity_id } = object

    const cursorObject =
      currentStage.c_starting_entity || currentStage.c_entity

    if (!currentStage.c_starting_entity) {
      const matchIndex = currentStage.c_aggregation.findIndex((stage) =>
        Object.keys(stage)
          .includes('$match')
      )

      if (matchIndex >= 0) {
        const matchStatement = currentStage.c_aggregation[matchIndex]

        const matchEntityId = {
          $match: { ...matchStatement.$match, _id: c_entity_id }
        }

        currentStage.c_aggregation[matchIndex] = matchEntityId
      } else {
        currentStage.c_aggregation = [
          { $match: { _id: c_entity_id } },
          ...currentStage.c_aggregation
        ]
      }
    }

    const cursorConfig = {
      object: cursorObject,
      c_aggregation: currentStage.c_aggregation,
      skipAcl: currentStage.skipAcl,
      grant: currentStage.grant,
      expressionPipeline: currentStage.expressionPipeline
    }

    if (currentStage.c_starting_entity) {
      cursorConfig.prefix = c_path
    }

    const cursor = this.buildCursor(cursorConfig)

    let entity

    try {
      entity = cursor.next()
    } catch (err) {
      logger.error(
        `[Transform] failed to get: ${JSON.stringify(cursorConfig)}`
      )
      logger.error(`[Transform] error is: ${err.toString()}`)

      // avoid this record
      return ooTableName
    }

    const cols = this.generateCols(c_headers_reading, entity)

    const newRow = this.generateNewRow(cols, headers, c_headers_writing)

    try {
      org.objects.OOs.updateOne(
        {
          name: ooTableName
        },
        {
          $push: newRow
        }
      )
        .pathPrefix('list')
        .execute()
    } catch (err) {
      error(`Failed to insert in ${ooTableName}:`, newRow)
    }

    return ooTableName
  }

}

@transform('dl__report_next')
class ReportNextTransform {

  beforeAll(memo) {
    memo.inserted = 0
    memo.notInserted = 0
  }

  @profile
  each(object, memo) {
    try {
      org.objects.OOs.updateOne(
        {
          name: memo.ooTableName
        },
        {
          $push: object
        }
      )
        .pathPrefix('list')
        .execute()
      memo.inserted++
    } catch (err) {
      memo.notInserted++
      console.log(err)
      error(`Failed to insert in ${memo.ooTableName}:`, object)
    }

    return memo.ooTableName
  }

  afterAll(memo) {
    debug('Generation complete', memo)
  }

}

@transform('dl__sql_query')
class SQLQueryTransform {

  @profile
  each(_, memo) {

    executeSqlQuery(memo.ooTableName, memo.sqlQuery, memo.values)

    return memo.ooTableName
  }

}