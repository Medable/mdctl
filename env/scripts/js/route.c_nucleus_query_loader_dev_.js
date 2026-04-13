import parser from 'c_nucleus_query_parser'
import { createQuery } from 'c_nucleus_query'
import _ from 'underscore'
import logger from 'logger'

const csv = require('request').body,
      // eslint-disable-next-line no-useless-escape
      commaNotInsideQuotes = /,(?=(?:[^\"]*\"[^\"]*\")*(?![^\"]*\"))/,
      // eslint-disable-next-line no-useless-escape
      stripQuotes = s => s.replace(/\"?([^"]*)\"?$/g, '$1')

let rows = csv.split('\n').map(x => x.split(commaNotInsideQuotes))

rows = rows.map(row => {
  let [ c_study, c_name, c_task_name, c_rules, c_step, c_message ] = row.map(stripQuotes)
  try {
    createQuery({ c_name, c_task_name, c_rules, c_step, c_message, c_study })
    return `OK`
  } catch (e) {
    logger.info(`Loader Error ${e}: ${c_name},${c_task_name},${c_rules}`)
    return `${e.reason || JSON.stringify(e)}`
  }
})

return rows