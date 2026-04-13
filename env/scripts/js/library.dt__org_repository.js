const { accessLevels } = consts

class OrgRepository {

  static getApps() {
    return org.objects.org.find()
      .paths('apps')
      .skipAcl()
      .grant(accessLevels.read)
      .toArray()[0]
      .apps
  }

}

module.exports = OrgRepository