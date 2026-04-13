const { c_public_users } = org.objects

class PublicUserRepository {

  static findAllIdsExceptIds(idsToExclude) {
    const allIds = c_public_users
      .find()
      .paths('_id')
      .map(publicUser => publicUser._id.toString())
    return allIds.filter(id => !idsToExclude.find(idToExclude => idToExclude === id))
  }

}

module.exports = PublicUserRepository