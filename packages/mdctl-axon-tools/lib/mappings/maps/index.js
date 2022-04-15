const MenuConfigMap = require('./MenuConfigMap')
const ReviewsTypesMap = require('./ReviewTypesMap')

module.exports = {
  async getMappings(org) {
    const menuConfigMap = new MenuConfigMap(org),
          reviewsTypesMap = new ReviewsTypesMap(org)

    return [
      ...await menuConfigMap.getMappings(),
      ...await reviewsTypesMap.getMappings()
    ]
  }
}
