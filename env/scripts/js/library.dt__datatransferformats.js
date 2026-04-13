/**
 * @fileOverview
 * @summary Data Transfer Library
 * @version 1.0.0
 *
 * @author Data Management Squad
 *
 * @example
 * const DataTransferFormats = require('dt__datatransferformats')
 */

const config = require('config'),
      semver = require('semver'),
      moment = require('moment.timezone')

/**
 * Class to manipulate formats and presets
 */
class DataTransferFormats {

  static AXON_VERSION = '4.16.0'

  /**
   * Preset list of data
   * @type {{date: string[], timezones: *, time: string[]}}
   */
  static presets = {
    date: [
      'None',
      'YYYY-MM-DD',
      'MM/DD/YYYY',
      'DD/MM/YYYY',
      'DD, MMM YYYY',
      'MMM, DD YYYY'
    ],
    time: ['None', 'HH:mm', 'HH:mm:ss', 'HH:mm:ss.SSS'],
    timezones: moment.tz.names()
  }

  /**
   * List of available formats
   */
  static formats = [
    {
      name: 'datetime',
      params: {
        tz: 'PATIENT'
      },
      as: 'array',
      operator: '$moment'
    },
    {
      name: 'date',
      params: {
        tz: 'PATIENT',
        format: 'YYYY-MM-DD'
      },
      as: 'array',
      operator: '$moment'
    },
    {
      name: 'time',
      params: {
        tz: 'PATIENT',
        format: 'HH:mm:ss'
      },
      as: 'array',
      operator: '$moment'
    },
    {
      name: 'trim',
      params: { chars: ' ' },
      as: 'object',
      operator: '$trim'
    },
    {
      name: 'trunc',
      params: { places: 0 },
      as: 'array',
      operator: '$trunc'
    },
    {
      name: 'toUpper',
      operator: '$toUpper'
    },
    {
      name: 'toLower',
      operator: '$toLower'
    },
    {
      name: 'ceil',
      operator: '$ceil'
    },
    {
      name: 'floor',
      operator: '$floor'
    },
    {
      name: 'round',
      operator: '$round'
    }
  ]

  /**
   * Convert a format object into an expression operator.
   * @param {Object|String} input represents a field or another expression
   * @param {Object} format a format object
   * @return {Object} expression.
   */
  static buildFormatExpression(input, format, type, apps) {
    const { operator, as, name } = format
    const params = Object.assign({}, format.params)
    if (Object.keys(params).length) {
      if (name === 'datetime') {
        params.format = `${params.date || ''} ${params.time || ''}`.trim()
        delete params.date
        delete params.time
      }

      if (params.tz) {
        params.tz = DataTransferFormats.getPatientTimeZone(apps, params.tz, type)
      }
      const commands = Object.entries(params)
        .map(([key, value]) => ({ [key]: value }))
      return { $cond: [input, { [operator]: as === 'array' ? [input, ...commands] : { input, ...commands[0] } }, ''] }
    }
    return { [operator]: [input] }
  }

  static getPatientTimeZone(apps, timezone = 'PATIENT', layout = 'long') {
    const { apps: { patient, site } } = config.get('dt__mobile_apps')
    const siteApps = apps.filter(a => site.includes(a.name)),
          patientApps = apps.filter(a => patient.includes(a.name)),
          source = layout === 'long' ? '$$ROOT.c_task_response' : '$$ROOT',
          axonVersionSupported = semver.gte(config.get('axon__version').version, DataTransferFormats.AXON_VERSION)
    return timezone === 'PATIENT' && axonVersionSupported ? {
      $cond: [
        { $in: [`${source}.c_client.c_client_key`, { $array: siteApps.map(s => s.key) }] },
        // use site tz or utc,
        { $ifNull: [`$$ROOT.c_site.c_tz`, 'UTC'] },
        // use task response tz or utc.
        {
          $cond: [
            { $in: [`${source}.c_client.c_client_key`, { $array: patientApps.map(s => s.key) }] },
            { $ifNull: [`${source}.c_tz`, 'UTC'] },
            'UTC' // any other app will be UTC
          ]
        }
      ]
    } : 'UTC'
  }

}

module.exports = DataTransferFormats