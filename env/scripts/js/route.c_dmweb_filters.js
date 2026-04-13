import faults from 'c_fault_lib'
import nucUtils from 'c_nucleus_utils'
const req = require('request')

const { query: { objectPath } } = req

if (!objectPath) {
  faults.throw('axon.invalidArgument.invalidArgumentsFormat')
}

const [object, path] = objectPath.split('.')

if (!object || !path) {
  faults.throw('axon.invalidArgument.invalidArgumentsFormat')
}

const schema = org.objects
  .object
  .find({ name: object })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .next()

const memo = {
  path,
  schema
}

const transform = {
  memo,
  autoPrefix: true,
  script: `
           beforeAll(memo, { cursor }) {
           
              const schema = memo.schema

              const schemaName = schema.name
              const schemaLabel = schema.label

              const props =  schema.properties

              const prop = memo.schema.properties.find(prop => prop.name === memo.path)

              const { name, label } = prop

              cursor.push({
                key: 'filter',
                data: {
                  name: schemaName,
                  label: schemaLabel,
                  prop: {
                    name,
                    label
                  }
                }
              })
            }
  
        each(object, memo) {

          if(!object[memo.path]) return

          const wrapper = {
            key: 'data',
            data: {
              _id: object._id,
              label: object[memo.path]
            }
          }
      
          return wrapper
        }
      `
}

const enumTransform = {
  memo,
  autoPrefix: true,
  script: `

    beforeAll(memo, {cursor}) {
    
        const prop = memo.schema.properties.find(prop => prop.name === memo.path)
        
        const { label , name } = prop
    
        cursor.push({
              key: 'filter',
              data: {
                name,
                label
              }
            })
        
    }
    
    each(object, memo, {cursor}) {
        memo.enumValues.forEach(enumVal => {
            cursor.push({
                  key: 'data',
                  data: enumVal
                })
        })
    }
`
}

function getReadableSites() {
  const paths = Array.from(arguments)
  if (nucUtils.isNewSiteUser(script.principal.roles)) {
    return org.objects.accounts
      .find()
      .pathPrefix(`${script.principal._id}/c_sites`)
      .paths('_id', ...paths)
      .toArray()
  }
  return org.objects.c_sites.find()
    .paths('_id', ...paths)
    .toArray()
}

const queriesByPath = {
  'c_site.c_number': () => {
    if (nucUtils.isNewSiteUser(script.principal.roles)) {
      return org.objects.accounts
        .aggregate()
        .pathPrefix(`${script.principal._id}/c_sites`)
        .transform(transform)
    }
    return org.objects.c_site.aggregate()
      .transform(transform)
  },
  'c_site.c_name': () => {
    if (nucUtils.isNewSiteUser(script.principal.roles)) {
      return org.objects.accounts
        .aggregate()
        .pathPrefix(`${script.principal._id}/c_sites`)
        .transform(transform)
    }
    return org.objects.c_site
      .aggregate()
      .transform(transform)
  },
  'c_public_user.c_number': () => {
    const siteIds = getReadableSites()
      .map(({ _id }) => _id)
    return org.objects.c_public_user
      .aggregate([{ $match: { 'c_site._id': { $in: siteIds } } }])
      .skipAcl()
      .grant(consts.accessLevels.read)
      .transform(transform)
  },
  'c_public_user.c_status': () => {
    return org.objects.c_study
      .aggregate([{
        $project: {
          _id: 1,
          c_subject_status_list: 1
        }
      }, {
        $limit: 1
      }])
      .transform({
        memo,
        autoPrefix: true,
        script: `
          beforeAll(memo, {cursor}) {
              
            const prop = memo.schema.properties.find(prop => prop.name === memo.path)
            
            const { label , name } = prop
        
            cursor.push({
                  key: 'filter',
                  data: {
                    name,
                    label
                  }
                })
            
        }
        
        each(object, memo, {cursor}) {
          if(object.c_subject_status_list) {
              object.c_subject_status_list.forEach(({c_status_value}) => {
                cursor.push({
                      key: 'data',
                      data: c_status_value
                    })
            })
          }
        }
      `
      })
  },
  'c_public_user.c_review_status': () => {
    const prop = schema.properties.find(prop => prop.name === path)
    const enumValues = prop && prop.validators[0] && prop.validators[0].definition && prop.validators[0].definition.values
    memo.enumValues = enumValues
    return org.objects.accounts.aggregate([{ $limit: 1 }])
      .skipAcl()
      .grant(consts.accessLevels.read)
      .transform(enumTransform)
  },
  'c_visit.c_name': () => {
    const study = org.objects.c_study
      .find()
      .paths('_id')
      .next()
    const visitScheduleIds = org.objects.c_visit_schedules
      .find({ 'c_study._id': study._id })
      .paths('_id')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()
      .map(({ _id }) => _id)
    return org.objects.c_visits
      .find()
      .paths('_id', 'c_visit_schedules', path)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .transform({
        memo: { ...memo, visitScheduleIds },
        autoPrefix: true,
        script: `
            beforeAll(memo, { cursor }) {

            const { label, name } = memo.schema
        
            cursor.push({
              key: 'filter',
              data: {
                name,
                label
              }
            })
          }
        
          each(visit, memo) {
        
            const { visitScheduleIds, path } = memo
        
            const { c_visit_schedules } = visit
        
            const { id } = require('util')
        
            const isValidSchedule = id.intersectIdArrays(c_visit_schedules, visitScheduleIds).length
        
            if (!isValidSchedule) return
        
            const label = visit[path]
            const _id = visit._id
        
            const wrapper = {
              key: 'data',
              data: {
                _id,
                label
              }
            }
        
            return wrapper
          }`
      })
  },
  'c_task.c_name': () => {
    const study = org.objects.c_study
      .find()
      .paths('_id')
      .next()
    return org.objects.c_tasks
      .aggregate([{ $match: { 'c_study._id': study._id } }])
      .skipAcl()
      .grant(consts.accessLevels.read)
      .transform(transform)
  },
  'c_task_response.c_clean_status': () => {
    const prop = schema.properties.find(prop => prop.name === path)
    const enumValues = prop && prop.validators[0] && prop.validators[0].definition && prop.validators[0].definition.values
    memo.enumValues = enumValues
    return org.objects.accounts.aggregate([{ $limit: 1 }])
      .skipAcl()
      .grant(consts.accessLevels.read)
      .transform(enumTransform)
  },
  'c_dmweb_report.c_title': () => {
    return org.objects.c_dmweb_report.aggregate()
      .transform(transform)
  }
}

const filterOp = queriesByPath[objectPath]

if (!filterOp) {
  faults.throw('axon.unsupportedOperation.notImplemented')
}

return filterOp()