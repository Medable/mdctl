const { getMappings, getEcMappings } = require('./maps')

function getScript(mappings) {
  return `
    import _ from 'lodash'
    const { run } = require('expressions')

    const mappings = ${JSON.stringify(mappings)}

    mappings.forEach(({ path, mapTo }) => {

      const [entity, entityKey, property, ...rest] = path.split('.'),
          isDocPropUpdate = !!rest.length
      let value = run(mapTo)

      const prop = entity.startsWith('ec__') ? 'ec__key' : 'c_key'

      if (isDocPropUpdate) {
        const [entityResult] = org.objects[entity]
          .find({ [prop]: entityKey })
          .paths(property)
          .limit(1)
          .toArray()

        if (!entityResult) return

        const documentProps = entityResult[property]

        if (!documentProps) return

        const [docPropKey, docProp] = rest

        if (!docPropKey || !docProp) return

        const propToUpdate = documentProps.find(({ c_key }) => c_key === docPropKey),

              idToUpdate = propToUpdate._id

        return org.objects[entity]
          .updateOne({ c_key: entityKey })
          .pathUpdate(property + '/' + idToUpdate + '/' + docProp , value)

      }

      if (entity === 'ec__document_template' && prop === 'ec__key' && property === 'ec__builder_data') {

        const idMapping = _.keyBy(value['ck-widgets-data'], 'ec__key')
        const {
          _id: template_id,
          ec__builder_data: { "ck-widgets-data": originalBuilderData },
          ec__status, creator, owner, updater
        } = org.objects.ec__document_templates.find({ ec__key: entityKey })
              .paths('ec__builder_data', 'ec__status', 'creator', 'owner', 'updater')
              .next()

        //We can update only draft templates
        if (ec__status !== 'draft') {
          return
        }

        //Map ids between builder_data and corresponding entities
        let new_builder_data = originalBuilderData.map((obd) => {
            const updatedId = _.get(idMapping, obd.id + '._id')
            _.set(obd, 'data._id', updatedId)
            _.get(obd, 'data.ec__document_template._id', false) && _.set(obd, 'data.ec__document_template._id', template_id)
            _.get(obd, 'data.ec__document_template.path', false) && _.set(obd, 'data.ec__document_template.path', '/ec__document_templates/' + template_id)
            _.get(obd, 'data.creator', false) && _.set(obd, 'data.creator', creator)
            _.get(obd, 'data.owner', false) && _.set(obd, 'data.owner', owner)
            _.get(obd, 'data.updater', false) && _.set(obd, 'data.updater', updater)
            return obd
        })
        value = { "ck-widgets-data": new_builder_data }
      }

      //normal prop update
      return org.objects[entity]
        .updateOne({ [prop]: entityKey }, { $set: { [property]: value }})
        .execute()

    })`
}

module.exports = {
  async getMappingScript(org) {

    const mappings = await getMappings(org)

    if (mappings.length === 0) return ''

    return getScript(mappings)
  },

  async getEcMappingScript(org, consentIds = []) {

    const mappings = await getEcMappings(org, consentIds)

    if (mappings.length === 0) return ''

    return getScript(mappings)
  }
}
