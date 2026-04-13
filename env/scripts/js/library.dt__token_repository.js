const { as } = require('decorators'),
      config = require('config'),
      { account } = org.objects,
      { accessLevels } = consts

class TokenRepository {

  @as('dt__service', { principal: { bypassCreateAcl: true, grant: accessLevels.script } })
  static createForSqlService() {
    const app = config.get('dt__sql_service_app')
    return account.createAuthToken(app, 'dt__service', {
      scope: ['user.sql-read-query'],
      permanent: false
    })
  }

}

module.exports = TokenRepository