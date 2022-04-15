const MenuConfigMap = require('./MenuConfigMap')
const ReviewsTypesMap = require('./ReviewTypesMap')

module.exports = async function getMappings(org) {
  const menuConfigMap = new MenuConfigMap(org),
        reviewsTypesMap = new ReviewsTypesMap(org)

  return [
    ...await menuConfigMap.getMappings(),
    ...await reviewsTypesMap.getMappings()
  ]
}
