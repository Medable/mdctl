const { Template: Base } = require('../template'),
      { sortKeys } = require('@medable/mdctl-core-utils')

class Template extends Base {

  constructor(name) {
    super('object', null, name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        allowConnections: false,
        auditing: {
          enabled: false
        },
        connectionOptions: {
          requireAccept: true,
          requiredAccess: 5,
          sendNotifications: true
        },
        createAcl: [
          'account.public'
        ],
        defaultAcl: [
          'owner.delete'
        ],
        hasETag: false,
        isDeletable: true,
        isUnmanaged: false,
        isVersioned: false,
        label: this.exportKey,
        name: this.exportKey,
        objectTypes: [],
        properties: [],
        shareAcl: [],
        shareChain: ['share', 'read', 'connected']
      }
    ))

  }

}

module.exports = Template
