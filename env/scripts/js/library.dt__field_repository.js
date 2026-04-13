const { objects } = org.objects,
      { accessLevels } = consts

class FieldRepository {

  static findForObjects(objectNames) {
    return objects.aggregate([
      {
        $match: {
          name: {
            $in: objectNames
          }
        }
      },
      {
        $project: {
          name: 1,
          label: 1,
          'properties.name': 1,
          'properties.label': 1,
          'properties.type': 1,
          'properties.properties.name': 1,
          'properties.properties.label': 1,
          'properties.properties.type': 1,
          'objectTypes.properties.name': 1,
          'objectTypes.properties.label': 1,
          'objectTypes.properties.type': 1
        }
      }
    ])
      .locale('en_US')
      .skipAcl()
      .grant(accessLevels.script)
      .toArray()
  }

}

module.exports = FieldRepository