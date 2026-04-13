import logger from 'logger'
import request from 'request'
import _ from 'underscore'
import nucUtils from 'c_nucleus_utils'
const { QueryStatus } = require('c_nucleus_query')

const findAudit = (requestBody) => {
        for (const k in requestBody) {
          const propValue = requestBody[k],
                audit = k === 'audit'
                  ? propValue
                  : typeof propValue === 'object'
                    ? findAudit(propValue)
                    : undefined

          if (audit) return audit
        }
      },

      updateQueryResponses = (stepResponseId, message) => {

        const openQueries = org.objects
          .c_queries
          .find({
            c_step_response: stepResponseId,
            c_status: QueryStatus.Open
          })
          .skipAcl()
          .grant(consts.accessLevels.read)
          .limit(100)
          .toArray()

        if (openQueries.length) {
          if (!nucUtils.isNewSiteUser(script.principal.roles)) {
            openQueries.forEach((openQuery) => {
              org.objects
                .c_sites
                .updateOne({ _id: openQuery.c_site._id })
                .pathUpdate('c_queries', [{ _id: openQuery._id, c_response: message }])
            })
          } else {
            openQueries.forEach((openQuery) => {
              org.objects
                .accounts
                .updateOne({ _id: script.principal._id })
                .pathUpdate(`c_sites/${openQuery.c_site._id}/c_queries`, [{ _id: openQuery._id, c_response: message }])
            })
          }

          return true

        }

        return false
      },

      isValueModified = script.arguments.modified.indexOf('c_value') >= 0,

      [querySchema] = org.objects.object.find({ name: 'c_query' })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .toArray(),

      isQueryResponseAvailable = _.chain(querySchema && querySchema.properties)
        .find(prop => prop.name === 'c_response')
        .value() || false,

      isAuditAvailable = findAudit(request.body)

// update query response doesn't run when the task response is Inactive
const taskResponseId = script.arguments.old.c_task_response._id

const [taskResponse] = org.objects
  .c_task_responses
  .find({ _id: taskResponseId })
  .paths('c_status')
  .skipAcl()
  .grant('read')
  .toArray()

if (!taskResponse) return

const isActive = taskResponse.c_status !== 'Inactive'

isActive &&
  isValueModified &&
      isQueryResponseAvailable &&
          isAuditAvailable &&
              isAuditAvailable.message &&
                  updateQueryResponses(script.arguments.new._id, isAuditAvailable.message)