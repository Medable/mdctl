const { getMappings } = require('./maps')

module.exports = {
  async getMappingScript(org) {

    const mappings = await getMappings(org)

    if (mappings.length === 0) return ''

    return `
const { run } = require('expressions')

const mappings = ${JSON.stringify(mappings)}

mappings.forEach(({ path, mapTo }) => {

  const [entity, entityKey, property, ...rest] = path.split('.'),
      isDocPropUpdate = !!rest.length,
      value = run(mapTo)

  if (isDocPropUpdate) {
    const [entityResult] = org.objects[entity]
      .find({ c_key: entityKey })
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

  //normal prop update
  return org.objects[entity]
    .updateOne({ c_key: entityKey }, { $set: { [property]: value }})
    .execute()

})`
  }
}
