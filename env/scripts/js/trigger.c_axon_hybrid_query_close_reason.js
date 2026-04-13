import logger from 'logger'
import request from 'request'
const { QueryStatus } = require('c_nucleus_query')

const { c_status: newStatus } = script.arguments.new,
      { c_status: currentStatus } = script.arguments.old,
      isDifferentStatus = (oldStatus, newStatus) => oldStatus !== newStatus,
      findAudit = (requestBody) => {
        for (const k in requestBody) {
          const propValue = requestBody[k],
                audit = k === 'audit' ? propValue
                  : typeof propValue === 'object' ? findAudit(propValue)
                    : undefined

          if (audit) return audit
        }
      },
      audit = findAudit(request.body),
      isClosingReasonAvailable = () => {
        const query = org.objects.object.find({ name: 'c_query' }).skipAcl().grant(consts.accessLevels.read).next()
        return query.properties.find(x => x.name === 'c_closing_reason')
      },
      isClosedStatus = (newStatus) => newStatus === QueryStatus.Closed || newStatus === QueryStatus.ClosedRequery

isClosingReasonAvailable() &&
    isDifferentStatus(currentStatus, newStatus) &&
        isClosedStatus(newStatus) &&
            audit && audit.message &&
                script.arguments.new.update('c_closing_reason', audit.message, { grant: consts.accessLevels.update })