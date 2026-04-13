/* eslint-disable no-template-curly-in-string */
import request from 'request'
import faults from 'c_fault_lib'
import { id } from 'util'
import nucUtils from 'c_nucleus_utils'

const { params: { entity, type }, query } = request

const entities = {
  c_public_user: ({ where, skip, limit, paths, sort, include }) => {
    let siteIds
    const isNewSiteUser = nucUtils.isNewSiteUser(script.principal.roles)
    if (isNewSiteUser) {
      siteIds = org.objects.accounts.find()
        .pathPrefix(`${script.principal._id}/c_sites`)
        .paths('_id')
        .toArray()
        .map(({ _id }) => _id)

    } else {
      siteIds = org.objects.c_sites.find()
        .paths('_id')
        .toArray()
        .map(({ _id }) => _id)

    }
    const pathsArr = paths ? paths.split(',') : []

    let whereWithSiteIds = { 'c_site._id': { $in: siteIds } }

    if (where) {
      const customWhere = JSON.parse(where)
      // We assume that the FE  will only send $in clause in c_site
      if (customWhere.c_site) {
        whereWithSiteIds['c_site._id'].$in = customWhere.c_site.$in.filter(siteId => id.inIdArray(siteIds, siteId))
        delete customWhere.c_site
      }
      whereWithSiteIds = { ...whereWithSiteIds, ...customWhere }
    }

    const aggregation = [
      {
        $match: whereWithSiteIds
      }
    ]

    if (sort) {
      aggregation.push({
        $sort: JSON.parse(sort)
      })
    }

    aggregation.push({
      $project: {
        _id: 1,
        c_site: 1
      }
    })

    const includeArr = include ? include.split(',') : []

    return {
      entity: 'c_public_user',
      paths: pathsArr,
      pathLabels: {
        c_number: 'Subject ID',
        c_review_status: 'Casebook Status'
      },
      limit: limit || 20,
      skip: skip || 0,
      aggregation,
      include: includeArr,
      prefixTpl: isNewSiteUser ? `${script.principal._id}` + '/c_sites/${c_site._id}/c_subjects/${_id}' : '${c_site._id}/c_subjects/${_id}'
    }
  }
}

const entityConfigFunc = entities[entity]

if (!entityConfigFunc) {
  faults.throw('axon.unsupportedOperation.notImplemented')
}

const types = {
  schema: getSchema,
  data: getData
}

const typeFunc = types[type]

if (!typeFunc) {
  faults.throw('axon.unsupportedOperation.notImplemented')
}

function getSchema(entityConfig) {
  const { paths, pathLabels, entity } = entityConfig

  const entitySchema = org.objects
    .object
    .find({ name: entity })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .next()

  if (paths.length) {
    entitySchema.properties = entitySchema.properties.filter(({ name }) => paths.includes(name))
  }

  if (pathLabels) {
    entitySchema.properties.forEach(prop => {
      const customLabel = pathLabels[prop.name]
      if (customLabel) {
        prop.label = customLabel
      }
    })
  }

  return entitySchema
}

function getData(entityConfig) {
  const { paths, skip, limit, aggregation, entity, prefixTpl, include } = entityConfig
  const [matchClause] = aggregation
  const countArr = org.objects[entity]
    .aggregate([
      matchClause,
      {
        $project: {
          _id: 1
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $count: '_id'
          }
        }
      }
    ])
    .skipAcl()
    .grant(consts.accessLevels.read)
    .toArray()

  const total = countArr.length ? countArr[0].total : 0

  const memo = {
    total,
    paths,
    prefixTpl,
    include
  }

  return org.objects[entity]
    .aggregate(aggregation)
    .skip(skip)
    .limit(limit)
    .skipAcl()
    .grant(consts.accessLevels.read)
    .transform({
      memo,
      autoPrefix: true,
      script: 'c_browse_data_transform'
    })
}

return typeFunc(entityConfigFunc(query))