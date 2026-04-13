import request from 'request'
import { Job } from 'renderer'
import faults from 'c_fault_lib'

const { params: { reportId, outputObjectName, outputFormat = 'csv' } } = request
const output = outputFormat.toLowerCase()

const [report] = org.objects.c_dmweb_reports.find({ _id: reportId })
  .toArray()
if (!report) faults.throw('axon.notFound.instanceNotFound')

const isOOFound = org.objects.OOs.find({ name: outputObjectName })
  .hasNext()

if (!isOOFound) {
  faults.throw('axon.notFound.instanceNotFound')
}

let outputObjectCursor = org.objects.OOs.aggregate(report.c_reading)

let headers = report.c_headers

if (report.c_reading) {
  const hasLimit = report.c_reading.find((stage) => stage.hasOwnProperty('$limit'))
  if (!hasLimit) {
    outputObjectCursor = outputObjectCursor.limit(false)
  }

  const hasProject = report.c_reading.find((stage) => stage.hasOwnProperty('$project'))

  if (hasProject) {
    const projectedProps = Object.keys(hasProject.$project)

    // use as headers only projected props
    headers = headers.filter(header => {
      return projectedProps.includes(header.name)
    })

  }
} else {
  outputObjectCursor = outputObjectCursor.limit(false)
}

const CSV_TEMPLATE = '{{#each (cursor report)}}{{{this}}}\n{{/each}}'
const reportJob = new Job('c_portal')

switch (output) {
  case 'csv': {
    const { setHeader } = require('response')
    const memo = {
      headers
    }
    const stream = reportJob
      .addCursor('report',
        outputObjectCursor
          .prefix(`${outputObjectName}/list`)
          .transform(
            {
              autoPrefix: true,
              memo,
              script: `
                beforeAll(memo, {cursor}) {
                  const labels = memo.headers.map(header => "\\"" + header.label + "\\"").join(',')
                  cursor.push(labels)
                }

                each(object, memo) {
                  const reportKeys = memo.headers.map(header => header.name)
                  return Object.keys(object).filter(key => reportKeys.includes(key)).map(key => {
                    const currentValue = object[key]
                    if(isNaN(currentValue)) {
                      return "\\"" + currentValue + "\\""
                    }else{
                      return currentValue
                    }
                  }).join(",")
                }
              `
            }
          )
      )
      .addTemplate('c_csv_template', CSV_TEMPLATE)
      .addOutput(report.c_title, output, ['c_csv_template'])
      .start()

    setHeader('Content-Type', 'text/csv')
    return stream
  }
  case 'default': {
    return outputObjectCursor
      .prefix(`${outputObjectName}/list`)
  }
  default:
    faults.throw('axon.unsupportedOperation.notImplemented')
}