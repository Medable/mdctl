import _ from 'lodash'

const localTypes = {
  SITE_LOCALE: 'siteLocales',
  PATIENT_LOCALE: 'patientLocales'
}

function updateSiteLocaleSingle(site, siteLocales, patientLocales) {
  if (siteLocales.length === 0 && patientLocales.length === 0) {
    return
  }
  org.objects.c_sites.updateOne({ _id: site }, {
    $set: {
      ...(patientLocales.length && { c_supported_locales: patientLocales }),
      ...(siteLocales.length && { c_site_supported_locales: siteLocales })
    }
  })
    .skipAcl()
    .grant('update')
    .execute()
}

function generateLocaleObject(localType, localeObject, currentLocale, updatesArray) {
  for (const update of updatesArray) { // update array has all the db updates we did for each site
    if (update[localType].changed.includes(currentLocale)) {
      localeObject[currentLocale].changed.push(update.siteNumber)
    }
    if (update[localType].unchanged.includes(currentLocale)) {
      localeObject[currentLocale].unchanged.push(update.siteNumber)
    }
  }
  return localeObject
}

function formatResponse(siteLocales, patientLocales, localeUpdatesArray) {
  const result = {}
  if (!localeUpdatesArray.length) { // return empty object if no updates were made
    return result
  }
  result.siteLocales = siteLocales.reduce((acc, siteLocale) => {
    if (!acc[siteLocale]) {
      acc[siteLocale] = {
        changed: [],
        unchanged: []
      }
    }
    return generateLocaleObject(localTypes.SITE_LOCALE, acc, siteLocale, localeUpdatesArray)
  }, {})

  result.patientLocales = patientLocales.reduce((acc, patientLocale) => {
    if (!acc[patientLocale]) {
      acc[patientLocale] = {
        changed: [],
        unchanged: []
      }
    }
    return generateLocaleObject(localTypes.PATIENT_LOCALE, acc, patientLocale, localeUpdatesArray)
  }, {})
  return { ...(!_.isEmpty(result.siteLocales) && { siteLocales: result.siteLocales }), ...(!_.isEmpty(result.patientLocales) && { patientLocales: result.patientLocales }) }
}

module.exports = {
  updateSiteLocaleSingle,
  formatResponse
}