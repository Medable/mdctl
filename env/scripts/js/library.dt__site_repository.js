const { c_sites } = org.objects

class SiteRepository {

  static findAllIdsExceptIds(idsToExclude) {
    const allIds = c_sites
      .find()
      .paths('_id')
      .map(site => site._id.toString())
    return allIds.filter(id => !idsToExclude.find(idToExclude => idToExclude === id))
  }

}

module.exports = SiteRepository