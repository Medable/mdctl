module.exports = class MenuConfigMapping {

  constructor(org) {
    this.org = org
  }

  async getExistingStudy() {
    let study = {}

    const [currentStudy] = await this.org
      .objects
      .c_study
      .find()
      .paths('c_menu_config', 'c_key')
      .limit(1)
      .toArray()

    if (currentStudy) {
      study = currentStudy
    }

    return study
  }

  async getStudySchema() {
    let schema = {}

    const [studySchema] = await this.org
      .objects
      .object
      .find({ name: 'c_study' })
      .paths(
        'properties.name',
        'properties.properties',
        'properties.properties.name',
        'properties.properties.type'
      )
      .limit(1)
      .passive(true)
      .toArray()

    if (studySchema) {
      schema = studySchema
    }

    return schema
  }

  hasStringGroupId(studySchema) {
    return studySchema
      .properties
      .find((prop) => {

        if (prop.name !== 'c_menu_config') return false

        const groupIdProp = prop.properties.find(({ name }) => name === 'c_group_id')

        if (!groupIdProp) return false

        return groupIdProp.type === 'String'
      })
  }

  async getMappings() {

    const mapping = [],
          currentStudy = await this.getExistingStudy(),
          menuConfig = currentStudy.c_menu_config || []

    if (menuConfig.length === 0) return mapping

    // eslint-disable-next-line one-var
    const schema = await this.getStudySchema()

    if (!schema.properties || !this.hasStringGroupId(schema)) return mapping

    // eslint-disable-next-line no-restricted-syntax
    for (const config of menuConfig) {

      const groupId = config.c_group_id,

            // eslint-disable-next-line no-await-in-loop
            [group] = await this.org
              .objects
              .c_groups
              .find({ _id: groupId })
              .paths('c_key')
              .limit(1)
              .toArray()

      if (group) {
        mapping.push({
          path: `c_study.${currentStudy.c_key}.c_menu_config.${config.c_key}.c_group_id`,
          mapTo: {
            $pathTo: [{
              $dbNext: {
                object: 'c_group',
                operation: 'cursor',
                paths: [
                  '_id'
                ],
                where: {
                  c_key: group.c_key
                }
              }
            }, '_id']
          }
        })
      }
    }

    return mapping
  }

  async getMappingScript() {
    const mappings = await this.getMappings()

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
})`
  }

}
