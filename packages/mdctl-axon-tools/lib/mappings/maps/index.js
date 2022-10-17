const MenuConfigMap = require('./MenuConfigMap')
const ReviewsTypesMap = require('./ReviewTypesMap')
const EcBuilderDataMap = require('./EcBuilderDataMap')

module.exports = {
  async getMappings(org) {
    const menuConfigMap = new MenuConfigMap(org),
          reviewsTypesMap = new ReviewsTypesMap(org),
          ecBuilderDataMap = new EcBuilderDataMap(org)

    return [
      ...await menuConfigMap.getMappings(),
      ...await reviewsTypesMap.getMappings(),
      ...await ecBuilderDataMap.getMappings()
    ]
  }
}
