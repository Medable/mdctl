/**
 * Org Library
 *
 * @class OrgLibrary
 */
class OrgLibrary {

  static getCode() {
    const [{ code }] = org.objects.org
      .find()
      .paths('code')
      .skipAcl()
      .grant('read')
      .toArray()
    return code
  }

  static getApiKey() {
    const [{ apps }] = org.objects.org
      .find()
      .paths('apps')
      .skipAcl()
      .grant('read')
      .toArray()
    const ecApp = apps.find(app => app.name === 'ec__econsent')
    if (!ecApp) return
    return ecApp.clients[0].key
  }

}

module.exports = { OrgLibrary }