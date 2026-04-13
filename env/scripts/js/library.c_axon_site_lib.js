import {
  trigger,
  log
} from 'decorators'
import _ from 'lodash'

/* eslint-disable-next-line */
import logger from 'logger'
import nucUtils from 'c_nucleus_utils'

import faults from 'c_fault_lib'
const { accessLevels } = consts
const { c_studies, c_public_users } = org.objects

class SiteLibrary {

  static validCountries = [
    'AF',
    'AX',
    'AL',
    'DZ',
    'AS',
    'AD',
    'AO',
    'AI',
    'AQ',
    'AG',
    'AR',
    'AM',
    'AW',
    'AU',
    'AT',
    'AZ',
    'BS',
    'BH',
    'BD',
    'BB',
    'BY',
    'BE',
    'BZ',
    'BJ',
    'BM',
    'BT',
    'BO',
    'BQ',
    'BA',
    'BW',
    'BV',
    'BR',
    'IO',
    'BN',
    'BG',
    'BF',
    'BI',
    'CV',
    'KH',
    'CM',
    'CA',
    'KY',
    'CF',
    'TD',
    'CL',
    'CN',
    'CX',
    'CC',
    'CO',
    'KM',
    'CG',
    'CD',
    'CK',
    'CR',
    'CI',
    'HR',
    'CU',
    'CW',
    'CY',
    'CZ',
    'DK',
    'DJ',
    'DM',
    'DO',
    'EC',
    'EG',
    'SV',
    'GQ',
    'ER',
    'EE',
    'SZ',
    'ET',
    'FK',
    'FO',
    'FJ',
    'FI',
    'FR',
    'GF',
    'PF',
    'TF',
    'GA',
    'GM',
    'GE',
    'DE',
    'GH',
    'GI',
    'GR',
    'GL',
    'GD',
    'GP',
    'GU',
    'GT',
    'GG',
    'GN',
    'GW',
    'GY',
    'HT',
    'HM',
    'VA',
    'HN',
    'HK',
    'HU',
    'IS',
    'IN',
    'ID',
    'IR',
    'IQ',
    'IE',
    'IM',
    'IL',
    'IT',
    'JM',
    'JP',
    'JE',
    'JO',
    'KZ',
    'KE',
    'KI',
    'KP',
    'KR',
    'KW',
    'KG',
    'LA',
    'LV',
    'LB',
    'LS',
    'LR',
    'LY',
    'LI',
    'LT',
    'LU',
    'MO',
    'MG',
    'MW',
    'MY',
    'MV',
    'ML',
    'MT',
    'MH',
    'MQ',
    'MR',
    'MU',
    'YT',
    'MX',
    'FM',
    'MD',
    'MC',
    'MN',
    'ME',
    'MS',
    'MA',
    'MZ',
    'MM',
    'NA',
    'NR',
    'NP',
    'NL',
    'NC',
    'NZ',
    'NI',
    'NE',
    'NG',
    'NU',
    'NF',
    'MK',
    'MP',
    'NO',
    'OM',
    'PK',
    'PW',
    'PS',
    'PA',
    'PG',
    'PY',
    'PE',
    'PH',
    'PN',
    'PL',
    'PT',
    'PR',
    'QA',
    'RE',
    'RO',
    'RU',
    'RW',
    'BL',
    'SH',
    'KN',
    'LC',
    'MF',
    'PM',
    'VC',
    'WS',
    'SM',
    'ST',
    'SA',
    'SN',
    'RS',
    'SC',
    'SL',
    'SG',
    'SX',
    'SK',
    'SI',
    'SB',
    'SO',
    'ZA',
    'GS',
    'SS',
    'ES',
    'LK',
    'SD',
    'SR',
    'SJ',
    'SE',
    'CH',
    'SY',
    'TW',
    'TJ',
    'TZ',
    'TH',
    'TL',
    'TG',
    'TK',
    'TO',
    'TT',
    'TN',
    'TR',
    'TM',
    'TC',
    'TV',
    'UG',
    'UA',
    'AE',
    'GB',
    'US',
    'UM',
    'UY',
    'UZ',
    'VU',
    'VE',
    'VN',
    'VG',
    'VI',
    'WF',
    'EH',
    'YE',
    'ZM',
    'ZW'
  ]

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_site', weight: 1 })
  static siteBeforeCreate({ new: newSite }) {

    // Validate Country code
    if (newSite.hasOwnProperty('c_country')) {
      if (!this.validCountryCode(newSite.c_country)) {
        return faults.throw('axon.validationError.invalidCountryCode')
      }
    }

    // Validate Country code in c_site_address
    if (_.get(newSite, 'c_site_address.c_country')) {
      if (!this.validCountryCode(_.get(newSite, 'c_site_address.c_country'))) {
        return faults.throw('axon.validationError.invalidCountryCode')
      }
    }

    if (!_.get(newSite, 'c_site_address.c_country') && _.get(newSite, 'c_country')) {
      script.arguments.new.update({ c_site_address: { c_country: _.get(newSite, 'c_country') } }, { grant: accessLevels.delete })
    }

    // get study
    const studyCursor = c_studies.find({ _id: newSite.c_study._id })
      .skipAcl()
      .grant(consts.accessLevels.read)
    if (!studyCursor.hasNext()) {
      return faults.throw('axon.invalidArgument.validStudyRequired')
    }
    const study = studyCursor.next()

    // set the site number
    /* eslint-disable-next-line eqeqeq */
    if (!newSite.hasOwnProperty('c_number') || newSite.c_number == '') {

      const autoNum = nucUtils.getNextSiteID(study)
      newSite.update('c_number', autoNum)
    }

    // validate site locale
    if (Array.isArray(newSite.c_supported_locales) && newSite.c_supported_locales.length) {
      const siteLocales = newSite.c_supported_locales
      const studyLocales = study.c_supported_locales
      if (!siteLocales.every(locale => studyLocales.includes(locale))) {
        return faults.throw('axon.invalidArgument.invalidSiteLocale')
      }
    }

    if (Array.isArray(newSite.c_site_supported_locales) && newSite.c_site_supported_locales.length) {
      const siteLocales = newSite.c_site_supported_locales
      const studyLocales = study.c_supported_locales
      if (!siteLocales.every(locale => studyLocales.includes(locale))) {
        return faults.throw('axon.invalidArgument.invalidSiteLocale')
      }
    }
  }

  @log({ traceError: true })
  @trigger('update.before', { object: 'c_site', weight: 1 })
  static siteBeforeUpdate({ new: newSite, old: oldSite, context }) {
    const studyId = org.objects[context.object]
      .find({ _id: context._id })
      .paths('c_study')
      .next()
      .c_study
      ._id

    // Validate Country code
    if (newSite.hasOwnProperty('c_country')) {
      if (!this.validCountryCode(newSite.c_country)) {
        return faults.throw('axon.validationError.invalidCountryCode')
      }
    }

    // Validate Country code in c_site_address
    if (_.get(newSite, 'c_site_address.c_country')) {
      if (!this.validCountryCode(_.get(newSite, 'c_site_address.c_country'))) {
        return faults.throw('axon.validationError.invalidCountryCode')
      }
    }

    if (!_.get(newSite, 'c_site_address.c_country') && _.get(newSite, 'c_country')) {
      script.arguments.new.update({ c_site_address: { c_country: _.get(newSite, 'c_country') } }, { grant: accessLevels.delete })
    }

    // get study
    const studyCursor = c_studies.find({ _id: studyId })
      .skipAcl()
      .grant(consts.accessLevels.read)
    if (!studyCursor.hasNext()) {
      return faults.throw('axon.invalidArgument.validStudyRequired')
    }
    const study = studyCursor.next()

    // validate site locale
    if (Array.isArray(newSite.c_supported_locales) && newSite.c_supported_locales.length) {
      const siteLocales = newSite.c_supported_locales
      const studyLocales = study.c_supported_locales
      if (!siteLocales.every(locale => studyLocales.includes(locale))) {
        return faults.throw('axon.invalidArgument.invalidSiteLocale')
      }
    }

    // validate participant locales being removed
    if (newSite.hasOwnProperty('c_supported_locales')) {
      const removedLocales = _.difference(oldSite.c_supported_locales, newSite.c_supported_locales)

      if (removedLocales.length) {
        const siteLocales = newSite.c_supported_locales
        const allPublicUserLocales = c_public_users.aggregate([
          { $match: { c_site: context._id } },
          { $group: { _id: 'c_locale' } }
        ])
          .skipAcl()
          .grant(consts.accessLevels.read)
        const publicUserLocales = allPublicUserLocales.map((c_locale) => c_locale._id)

        if (!publicUserLocales.every(locale => siteLocales.includes(locale))) {
          return faults.throw('axon.invalidArgument.invalidSiteParticipantLocale')
        }
      }
    }

    // validate site supported locales
    if (Array.isArray(newSite.c_site_supported_locales) && newSite.c_site_supported_locales.length) {
      const siteLocales = newSite.c_site_supported_locales
      const studyLocales = study.c_supported_locales
      if (!siteLocales.every(locale => studyLocales.includes(locale))) {
        return faults.throw('axon.invalidArgument.invalidSiteLocale')
      }
    }
  }

  static validCountryCode(country) {
    return this.validCountries.includes(country)
  }

}

module.exports = SiteLibrary