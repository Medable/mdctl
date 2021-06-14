import ObjectBuilder from '../base/object-builder'

export default class AccountBuilder extends ObjectBuilder {

  static _type() {
    return 'account'
  }

  static defaults() {
    return {
      email: `unittest+${this._uniqueId}_${Date.now()}@medable.com`,
      mobile: '+1 505 555 5555',
      name: { first: 'Test', last: 'User' },
      roles: []
    }
  }

  // Maps roles to known ids in the API.
  async resolveRoles() {
    if (!this.properties.roles.length) {
      return
    }
    const { data: [{ roles }] } = await this.objectInstance.client.get('orgs?paths=roles')
    this.properties.roles = this.properties.roles.map(idNameOrCode => {
      let role = roles.find(r => r._id === idNameOrCode)
      if (role) {
        return role._id
      }
      role = roles.find(r => r.name === idNameOrCode)
      if (role) {
        return role._id
      }
      role = roles.find(r => r.code === idNameOrCode)
      if (role) {
        return role._id
      }
      throw new Error(`Could not find role with matching _id, name, or code: ${idNameOrCode}`)
    })
  }

  // Custom account builder can resolve roles and create a client for the user.
  async build() {
    const client = this.objectInstance.client

    await this.resolveRoles()
    const properties = await client.post('org/accounts', this.properties)

    this.objectInstance.updateProperties(properties)
    this.objectInstance._cleaner.track(this.objectInstance)

    // accounts require different urls for create/delete.
    const url = `org/accounts/${this.objectInstance._id}`
    this.objectInstance._deleteUrl = url

    this.objectInstance.credentials = {
      password: 'qpal1010',
      email: this.properties.email
    }

    await client.put(url, {
      password: this.objectInstance.credentials.password,
      stats: { mustResetPassword: false, passwordExpires: null }
    })

    this.objectInstance.client = client.clientForCreds(this.objectInstance.credentials)

    await this.objectInstance.client.login()
    return this.objectInstance
  }

  addRole(role) {
    this.properties.roles.push(role)
    return this
  }

}