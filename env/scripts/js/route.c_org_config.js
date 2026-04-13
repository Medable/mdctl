import faults from 'c_fault_lib'

const { params: { info }, headers } = require('request')
const { org: Org } = org.objects

switch (info) {
  case 'version': {
    const config = require('config')
    const versions = [
      'axon__version',
      'axon_prerelease_version'
      // add other versions...
    ]

    return versions.reduce((acc, versionName) => {
      const version = config.get(versionName)

      if (version) {
        return { ...acc, [versionName]: version }
      }

      return acc
    }, {})
  }
  case 'apps': {

    return Org
      .find()
      .skipAcl()
      .grant('read')
      .paths('apps')
      .next()
      .apps
      .map(({ name, label }) => ({ name, label }))

  }
  case 'session_info': {
    const headerApiKey = headers['medable-client-key']
    const orgApps = Org.find()
      .paths('apps', 'security')
      .skipAcl()
      .grant('read')
      .next()
    const apps = orgApps.apps
    const security = orgApps.security
    const appItem = apps.find((app) => app.clients.find((client) => client.key === headerApiKey))
    const lockAttempts = security.unauthorizedAccess.lockAttempts
    const lockDuration = security.unauthorizedAccess.lockDuration
    const authDuration = appItem.clients[0].authDuration
    return {
      authDuration,
      lockDuration,
      lockAttempts
    }
  }
  default:
    faults.throw('axon.unsupportedOperation.notImplemented')
}