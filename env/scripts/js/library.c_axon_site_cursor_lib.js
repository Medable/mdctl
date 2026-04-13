import { isNewSiteUser } from 'c_dmweb_reports_generator'
import _ from 'lodash'

function siteFind(params = {}) {
  const isNew = isNewSiteUser(script.principal.roles)
  if (!isNew) {
    const cursor = _.isEmpty(params.condition) ? org.objects.c_site.find() : org.objects.c_site.find(params.condition)
    return { siteCursor: cursor, path: params.prefix ? params.prefix : '' }
  } else {
    const cursor = org.objects.account.find()
    return { siteCursor: cursor, path: params.prefix ? `${script.principal._id}/c_sites/${params.prefix}` : `${script.principal._id}/c_sites` }
  }
}

function siteAggregate(params = {}) {
  const isNew = isNewSiteUser(script.principal.roles)
  if (!isNew) {
    const cursor = _.isEmpty(params.condition) ? org.objects.c_site.aggregate() : org.objects.c_site.aggregate(params.condition)
    return { siteCursor: cursor, path: params.prefix ? params.prefix : '' }

  } else {
    const cursor = _.isEmpty(params.condition) ? org.objects.account.aggregate() : org.objects.account.aggregate(params.condition)
    return { siteCursor: cursor, path: params.prefix ? `${script.principal._id}/c_sites/${params.prefix}` : `${script.principal._id}/c_sites` }
  }
}

module.exports = {
  siteFind,
  siteAggregate
}