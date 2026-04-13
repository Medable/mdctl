/***********************************************************

 @script     Axon - Dmweb - Transforms Library

 @brief      Transforms Support Library For Dmweb Tabs

 @author     James Sas    (Medable.MIL)

 (c)2019 Medable, Inc.  All Rights Reserved.
 Unauthorized use, modification, or reproduction is prohibited.
 This is a component of Axon, Medable's SmartStudy(TM) system.

 ***********************************************************/

import { debug } from 'logger'
import nucUtils from 'c_nucleus_utils'
// due to some reason this is run skipping ACLs (probably because of all the skip ACLS annotations) , we need to enforce this to be run as the principal
const isNewSiteUser = nucUtils.isNewSiteUser(script.principal.roles)
const { transform } = require('decorators-transform'),
      { as } = require('decorators'),
      _ = require('underscore'),
      { profiler, paths: { to: pathTo }, id } = require('util'),
      schemas = require('schemas'),
      res = require('response'),
      moment = require('moment'),
      { c_task_response: TaskResponse, c_site: Site, accounts: Accounts } = org.objects,
      { QueryStatus } = require('c_nucleus_query'),
      SITE_IDS = !isNewSiteUser
        ? script.as(script.principal.email, {}, () => Site.find()
          .map(x => x._id))
        : script.as(script.principal.email, {}, () => Accounts.find({ _id: script.principal._id })
          .paths('c_site_access_list')
          .next().c_site_access_list),
      DEFAULT_PAGE_SIZE = 20,
      DEFAULT_AGE_THRESHOLD = 30,

      // there is a bug in the profile decorator of 2.11.1. need to create it here for now.
      profile = (() => {
        const { decorate } = require('decorator-utils')

        function handleDescriptor(target, key, descriptor, [prefix = null]) {
          if (!profiler.enabled) {
            return descriptor
          }

          const fn = descriptor.value

          if (prefix === null) {
            prefix = `${target.constructor.name}.${key}`
          }

          if (typeof fn !== 'function') {
            throw new SyntaxError(`@profile can only be used on functions, not: ${fn}`)
          }

          return {
            ...descriptor,
            value: function(...args) {
              return profiler.profile(prefix, () => {
                return fn.call(this, ...args)
              })
            }
          }
        }

        return function profile(...args) {
          return decorate(handleDescriptor, args)
        }
      })()

// when in development, it's okay to run profiler and log results.
if (script.env.name === 'development') {

  const { debug } = require('logger')

  profiler.enabled = true

  script.on('exit', () => {
    debug(profiler.report())
  })
}

// ---------------------------------------------------------------------------------------------------------------------

class Tab {

  @profile
  before(memo) {

    this.TODAY = moment(memo.date)
    this.COMPUTED_AGE_THRESHOLD = memo.COMPUTED_AGE_THRESHOLD
    this.columns = memo.columns
    memo.documents = 0
  }

  @profile
  each(object, memo, { cursor }) {

    let result

    try {
      result = this.getRecord(object)
    } catch (e) {
      result = e.toJSON()
    }

    if (!result) return

    memo.documents++

    return { key: 'data', data: result }
  }

  @profile
  afterAll(memo, { cursor }) {

    let total = 0

    // only set totals if there was at least 1 document pushed
    if (memo.documents) {
      total = memo.total
    }

    cursor.push({ key: 'totals', data: { total, hasMore: cursor.hasMore } })
  }

  @profile
  getSelectedColumns() {

    const { query: { colsToShow } = {} } = require('request'),
          schema = this.getDefaultSchema(),
          schemaKeys = _.pluck(schema.properties, 'name'),
          queriedKeys = colsToShow ? colsToShow.split(',') : []

    return ['_id', ...(_.isEmpty(queriedKeys) ? schemaKeys : queriedKeys)]

  }

  getDefaultSchema() {
    throw new TypeError('Pure Virtual Function Call')
  }

  getCursor() {
    throw new TypeError('Pure Virtual Function Call')
  }

  getRecord() {
    throw new TypeError('Pure Virtual Function Call')
  }

}

// ---------------------------------------------------------------------------------------------------------------------

@transform
class ReviewTab extends Tab {

  @profile
  beforeAll(memo) {

    const { query: { queryAge, where } = {} } = require('request')

    memo.date = new Date()
    memo.COMPUTED_AGE_THRESHOLD = moment(memo.date)
      .subtract(queryAge || DEFAULT_AGE_THRESHOLD, 'days')
      .toISOString()
    memo.columns = this.getSelectedColumns()
    memo.total = TaskResponse
      .find(this.extendWhereClause(where))
      .skipAcl()
      .grant('read')
      .count()
  }

  @profile
  getCursor({ skip = 0, limit = DEFAULT_PAGE_SIZE, where, sort } = {}) {

    const cursor = TaskResponse
      .find(this.extendWhereClause(where))
      .paths('_id', 'c_site')
      .skipAcl()
      .grant('read')
      .skip(skip)
      .limit(limit)

    if (sort) {
      cursor.sort(sort)
    }

    return cursor
      .transform({
        script: `
         module.exports = require('c_dmweb_transforms_lib').ReviewTab
       `
      })
  }

  @profile
  getRecord({ _id: taskResponseId, c_site: { _id: siteId } }) {

    let queryCounts

    const getQueryCountColumn = column => {
            if (!queryCounts) {
              profiler.start('getQueryCountColumn')
              if (!isNewSiteUser) {
                queryCounts = Site
                  .aggregate()
                  .pathPrefix(`${siteId}/c_task_responses/${taskResponseId}/c_queries`)
                  .match({
                    c_status: {
                      $in: ['open', 'responded']
                    }
                  })
                  .project({
                    overAge: {
                      $lte: ['created', {
                        $date: this.COMPUTED_AGE_THRESHOLD
                      }]
                    }
                  })
                  .group({
                    _id: null,
                    overAgeQueriesCount: {
                      $count: 'overAge'
                    },
                    queryCount: {
                      $count: '_id'
                    }
                  })
                  .toArray()[0] || {}
              } else {
                queryCounts = Accounts
                  .aggregate()
                  .pathPrefix(`${script.principal._id}/c_sites/${siteId}/c_task_responses/${taskResponseId}/c_queries`)
                  .match({
                    c_status: {
                      $in: ['open', 'responded']
                    }
                  })
                  .project({
                    overAge: {
                      $lte: ['created', {
                        $date: this.COMPUTED_AGE_THRESHOLD
                      }]
                    }
                  })
                  .group({
                    _id: null,
                    overAgeQueriesCount: {
                      $count: 'overAge'
                    },
                    queryCount: {
                      $count: '_id'
                    }
                  })
                  .toArray()[0] || {}
              }
              profiler.end('getQueryCountColumn')
            }
            return queryCounts[column] || 0
          },
          columnMap = {
            _id: {
              paths: ['_id'],
              format: tr => tr._id
            },
            task_id: {
              paths: ['c_number'],
              format: tr => tr.c_number
            },
            site: {
              paths: ['c_site.c_name'],
              format: tr => pathTo(tr, 'c_site.c_name')
            },
            site_number: {
              paths: ['c_site.c_number'],
              format: tr => pathTo(tr, 'c_site.c_number')
            },
            subject: {
              paths: ['c_public_user.c_number'],
              format: tr => pathTo(tr, 'c_public_user.c_number')
            },
            visit: {
              paths: ['c_visit.c_name'],
              format: tr => pathTo(tr, 'c_visit.c_name')
            },
            task: {
              paths: ['c_task.c_name'],
              format: tr => pathTo(tr, 'c_task.c_name')
            },
            status: {
              paths: ['c_clean_status'],
              format: tr => tr.c_clean_status
            },
            overAgeQueriesCount: {
              format: () => getQueryCountColumn('overAgeQueriesCount')
            },
            queryCount: {
              format: () => getQueryCountColumn('queryCount')
            },
            queries: {
              format: tr => this.fetchQueries(siteId, tr._id)
            },
            c_start: {
              paths: ['c_start'],
              format: tr => {
                return tr.c_start
              }
            },
            created: {
              paths: ['created'],
              format: tr => {
                return tr.created
              }
            },
            c_end: {
              paths: ['c_end'],
              format: tr => {
                return tr.c_end
              }
            }
          },
          columnPaths = this.columns.reduce((paths, column) => {
            if (columnMap[column]) {
              paths.push(...(columnMap[column].paths || []))
            }
            return paths
          }, []),
          otherPaths = ['c_group', 'c_task']

    // read selected paths
    let doc
    if (!isNewSiteUser) {
      [doc] = Site
        .find()
        .paths(...columnPaths, ...otherPaths)
        .prefix(`${siteId}/c_task_responses/${taskResponseId}`)
        .passive()
        .toArray()
    } else {
      [doc] = Accounts
        .find()
        .paths(...columnPaths, ...otherPaths)
        .prefix(`${script.principal._id}/c_sites/${siteId}/c_task_responses/${taskResponseId}`)
        .passive()
        .toArray()
    }

    if (!doc) return

    return this.columns.reduce((result, column) => {
      if (columnMap[column] && columnMap[column].format) {
        result[column] = columnMap[column].format(doc)
      }
      return result
    }, {})

  }

  @profile
  fetchQueries(siteId, taskResponseId) {
    let queries
    if (!isNewSiteUser) {
      queries = Site
        .aggregate([{
          $match: {
            c_status: {
              $in: [QueryStatus.Open, QueryStatus.Responded, QueryStatus.Closed, QueryStatus.ClosedRequery]
            }
          }
        },
        {
          $project: {
            c_status: 1,
            c_description: 1,
            created: 1,
            c_closed_datetime: 1
          }
        }])
        .prefix(`${siteId}/c_task_responses/${taskResponseId}/c_queries`)
        .toArray()
    } else {
      queries = Accounts
        .aggregate([{
          $match: {
            c_status: {
              $in: [QueryStatus.Open, QueryStatus.Responded, QueryStatus.Closed, QueryStatus.ClosedRequery]
            }
          }
        },
        {
          $project: {
            c_status: 1,
            c_description: 1,
            created: 1,
            c_closed_datetime: 1
          }
        }])
        .prefix(`${script.principal._id}/c_sites/${siteId}/c_task_responses/${taskResponseId}/c_queries`)
        .toArray()
    }

    const queriesWrapper = { data: [] }

    queriesWrapper.data = queries.map((query) => {

      let age

      if (query.c_closed_datetime && query.c_status === 'closed') {
        age = moment(query.c_closed_datetime)
          .diff(moment(query.created), 'days') || 1
      } else {
        age = this.TODAY.diff(moment(query.created), 'days') || 1
      }

      return {
        ...query,
        age
      }
    })

    return queriesWrapper
  }

  @profile
  getDefaultSchema() {

    const taskResponseSchema = schemas.read('c_task_response')

    taskResponseSchema.label = 'Review Tab Info'

    const defaultProps = taskResponseSchema
      .properties.filter(p => [
        'c_site',
        'c_public_user',
        'c_visit',
        'c_task'
      ].indexOf(p.name) !== -1)

    const customProps = [
      {
        fqpp: 'c_task_response.site',
        label: 'Site Name',
        name: 'site',
        type: 'String'
      },
      {
        fqpp: 'c_task_response.site_number',
        label: 'Site ID',
        name: 'site_number',
        type: 'String'
      },
      {
        fqpp: 'c_task_response.subject',
        label: 'Subject',
        name: 'subject',
        type: 'String'
      },
      {
        fqpp: 'c_task_response.visit',
        label: 'Visit',
        name: 'visit',
        type: 'String'
      },
      {
        fqpp: 'c_task_response.task',
        label: 'Task',
        name: 'task',
        type: 'String'
      },
      {
        fqpp: 'c_task_response.queryCount',
        label: 'Open Queries',
        name: 'queryCount',
        type: 'Number'
      },
      {
        fqpp: 'c_task_response.overAgeQueriesCount',
        label: 'Queries + 30 days',
        name: 'overAgeQueriesCount',
        type: 'Number'
      },
      {
        fqpp: 'c_task_response.c_clean_status',
        label: 'Status',
        name: 'status',
        type: 'String'
      },
      {
        fqpp: 'c_task_response.task_id',
        label: 'ID',
        name: 'task_id',
        type: 'String'
      },
      {
        fqpp: 'c_task_response.queries',
        name: 'queries',
        label: 'Queries',
        type: 'List',
        sourceObject: 'c_query',
        linkedProperty: 'c_task_response'
      },
      {
        label: 'Date Captured',
        name: 'created',
        type: 'Date',
        fqpp: 'c_task_response.created',
        indexed: true
      },
      {
        label: 'Task Start',
        name: 'c_start',
        type: 'Date',
        fqpp: 'c_task_response.c_start',
        indexed: true
      },
      {
        label: 'Task End',
        name: 'c_end',
        type: 'Date',
        fqpp: 'c_task_response.c_end',
        indexed: true
      }
    ]

    taskResponseSchema.properties = [...defaultProps, ...customProps]

    return taskResponseSchema
  }

  @profile
  extendWhereClause(whereString) {

    let where = !_.isEmpty(whereString) ? JSON.parse(whereString) : null
    if (where) {
      // filters sent but includes c_iste
      if (_.keys(where)
        .includes('c_site')) {
        const allowedIds = where.c_site.$in.filter(s => id.inIdArray(SITE_IDS, s))
        where.c_site.$in = _.isEmpty(allowedIds) ? SITE_IDS : allowedIds
      } else {
        // filter sent but doesn't include c_site
        where = { ...where, c_site: { $in: SITE_IDS } }
      }
    } else {
      // no filter sent from BE
      where = { c_site: { $in: SITE_IDS } }
    }

    return where
  }

}

// ---------------------------------------------------------------------------------------------------------------------

@transform
class SiteTab extends Tab {

  @profile
  beforeAll(memo) {

    const { query: { queryAge, where } = {} } = require('request')

    memo.date = new Date()
    memo.COMPUTED_AGE_THRESHOLD = moment(memo.date)
      .subtract(queryAge || DEFAULT_AGE_THRESHOLD, 'days')
      .toISOString()
    memo.columns = this.getSelectedColumns()
    if (!isNewSiteUser) {
      memo.total = Site
        .find(this.extendWhereClause(where))
        .count()
    } else {
      memo.total = Accounts
        .find()
        .pathPrefix(`${script.principal._id}/c_sites`)
        .where({ ...this.extendWhereClause(where) })
        .toArray()
        .length
    }
  }

  @profile
  getCursor({ skip = 0, limit = DEFAULT_PAGE_SIZE, where, sort } = {}) {
    let cursor
    if (!isNewSiteUser) {
      cursor = Site.find(this.extendWhereClause(where))
        .paths('_id')
        .skip(skip)
        .limit(limit)
    } else {
      cursor = Accounts
        .find()
        .pathPrefix(`${script.principal._id}/c_sites`)
        .where({ ...this.extendWhereClause(where) })
        .paths('_id')
        .skip(skip)
        .limit(limit)

    }

    if (sort) {
      cursor.sort(sort)
    }

    return cursor
      .transform({
        script: `
         module.exports = require('c_dmweb_transforms_lib').SiteTab
       `
      })
  }

  @profile
  getRecord({ _id: siteId }) {

    let queryCounts
    let count

    const getQueryCounts = () => {
            if (!queryCounts) {
              profiler.start('queryCounts')
              if (!isNewSiteUser) {
                queryCounts = Site
                  .aggregate()
                  .pathPrefix(`${siteId}/c_queries`)
                  .match({
                    c_status: {
                      $in: ['open', 'responded']
                    }
                  })
                  .project({
                    overAge: {
                      $lte: ['created', {
                        $date: this.COMPUTED_AGE_THRESHOLD
                      }]
                    },
                    c_status: 1
                  })
                  .toArray()
              } else {
                queryCounts = Accounts
                  .aggregate()
                  .pathPrefix(`${script.principal._id}/c_sites/${siteId}/c_queries`)
                  .match({
                    c_status: {
                      $in: ['open', 'responded']
                    }
                  })
                  .project({
                    overAge: {
                      $lte: ['created', {
                        $date: this.COMPUTED_AGE_THRESHOLD
                      }]
                    },
                    c_status: 1
                  })
                  .toArray()
              }
              profiler.end('queryCounts')
            }
            return queryCounts
          },
          columnMap = {
            _id: {
              paths: ['_id'],
              format: site => site._id
            },
            c_number: {
              paths: ['c_number'],
              format: site => site.c_number
            },
            c_name: {
              paths: ['c_name'],
              format: site => site.c_name
            },
            overAgeQueriesCount: {
              format: () => _.filter(getQueryCounts(), q => q.overAge).length
            },
            subjectsCount: {
              format: site => {
                profiler.start('subjectsCount')
                if (!isNewSiteUser) {
                  count = pathTo(Site
                    .aggregate()
                    .pathPrefix(`${site._id}/c_subjects`)
                    .group({
                      _id: null,
                      count: {
                        $count: '_id'
                      }
                    })
                    .toArray()[0], 'count') || 0
                } else {
                  count = pathTo(Accounts
                    .aggregate()
                    .pathPrefix(`${script.principal._id}/c_sites/${site._id}/c_subjects`)
                    .group({
                      _id: null,
                      count: {
                        $count: '_id'
                      }
                    })
                    .toArray()[0], 'count') || 0
                }
                profiler.end('subjectsCount')
                return count
              }
            },
            openQueriesCount: {
              format: () => _.filter(getQueryCounts(), q => q.c_status.toLowerCase() === 'open').length
            },
            respondedQueriesCount: {
              format: () => _.filter(getQueryCounts(), q => q.c_status.toLowerCase() === 'responded').length
            }
          },
          paths = this.columns.reduce((paths, column) => {
            if (columnMap[column]) {
              paths.push(...(columnMap[column].paths || []))
            }
            return paths
          }, [])

    // read selected paths
    let doc
    if (!isNewSiteUser) {
      doc = Site.readOne({ _id: siteId })
        .paths(...paths)
        .passive()
        .execute()
    } else {
      [doc] = Accounts
        .find()
        .paths(...paths)
        .prefix(`${script.principal._id}/c_sites/${siteId}`)
        .passive()
        .toArray()
    }

    return this.columns.reduce((result, column) => {
      if (columnMap[column] && columnMap[column].format) {
        result[column] = columnMap[column].format(doc)
      }
      return result
    }, {})

  }

  @profile
  getDefaultSchema() {

    const siteSchema = schemas.read('c_site')

    siteSchema.label = 'Site Tab Info'

    const idProp = siteSchema.properties.find(prop => prop.name === '_id')

    const customProps = [
      {
        fqpp: 'c_site.c_number',
        label: 'Site ID',
        name: 'c_number',
        read: 1,
        readOnly: true,
        type: 'String',
        indexed: true
      },
      {
        fqpp: 'c_site.c_name',
        label: 'Site Name',
        name: 'c_name',
        read: 1,
        readOnly: true,
        type: 'String',
        indexed: true
      },
      {
        fqpp: 'c_site.subjectsCount',
        label: 'Subjects',
        name: 'subjectsCount',
        read: 1,
        readOnly: true,
        type: 'Number'
      },
      {
        fqpp: 'c_site.overAgeQueriesCount',
        label: 'Queries 30+ days',
        name: 'overAgeQueriesCount',
        read: 1,
        readOnly: true,
        type: 'Number'
      },
      {
        fqpp: 'c_site.openQueriesCount',
        label: 'Open Queries',
        name: 'openQueriesCount',
        read: 1,
        readOnly: true,
        type: 'Number'
      },
      {
        fqpp: 'c_site.respondedQueriesCount',
        label: 'Open Responses',
        name: 'respondedQueriesCount',
        read: 1,
        readOnly: true,
        type: 'Number'
      }
    ]

    siteSchema.properties = [idProp, ...customProps]

    return siteSchema

  }

  @profile
  extendWhereClause(whereString) {

    let where = !_.isEmpty(whereString) ? JSON.parse(whereString) : null

    if (where) {
      if (where.c_site) {
        const allowedIds = where.c_site.$in.filter(s => id.inIdArray(SITE_IDS, s))
        delete where.c_site // unfortunately we can't filter by c_site in c_site so we need to remove that filter
        where = { ...where, _id: { $in: _.isEmpty(allowedIds) ? SITE_IDS : allowedIds } }
      }
    } else {
      where = { _id: { $in: SITE_IDS } }
    }

    return where
  }

}

module.exports = {

  ReviewTab,
  SiteTab

}