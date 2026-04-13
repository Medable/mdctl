const request = require('request')
const { getReportOperation } = require('c_dmweb_reports_generator')
const cache = require('cache')

const reportId = request.params.reportId

return getReportOperation(reportId)