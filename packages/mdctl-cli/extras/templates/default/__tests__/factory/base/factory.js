export default class Factory {

  constructor(client, registry, cleaner) {
    this.client = client
    this.registry = registry
    this.cleaner = cleaner

    this.new = new Proxy(this.registry, {
      get: (registry, objectType) => {
        const Builder = this.registry.getBuilder(objectType)
        return new Builder(this.client, this.cleaner, this)
      }
    })
  }

  async clean() {
    return this.cleaner.clean()
  }

}