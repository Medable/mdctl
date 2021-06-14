
export default class ObjectInstance {

  constructor(_type, client, cleaner) {
    // Object Id
    this._id = undefined
    // Object Type
    this._type = _type
    // Client
    this.client = client
    // Properties
    this._properties = {}

    this._cleaner = cleaner
  }

  get url() {
    if (this._id) {
      return `${this._type}/${this._id}`
    }
    return `${this._type}`
  }

  objectMustExistForAction(action) {
    if (!this._id) {
      throw new Error(`Cannot ${action} object without id, did you create this object yet?`)
    }
  }

  parseResponse(response) {
    if (response._id) {
      return response
    }
    return Array.isArray(response.data)
      ? response.data[response.data.length - 1]
      : response.data
  }

  updateProperties(result) {
    this._id = result._id
    Object.assign(this._properties, result)
  }

  async create(properties) {
    if (this._id) {
      throw new Error(`Object ${this.url} has already been created.`)
    }
    const response = await this.client.post(this.url, properties),
          result = this.parseResponse(response)
    if (result) {
      this.updateProperties(result)
      this._cleaner.track(this)
    }
    return response
  }

  async delete() {
    this.objectMustExistForAction('delete')
    return this.client.delete(this.url)
  }

  async update(properties) {
    this.objectMustExistForAction('update')
    return this.client.put(this.url, properties)
  }

  async read() {
    this.objectMustExistForAction('read')
    return this.parseResponse(await this.client.get(this.url))
  }

}