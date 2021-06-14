import Factory from './factory'
import BuilderRegistry from './builder-registry'
import FactoryCleaner from './factory-cleaner'

export default class FactoryBuilder {

  constructor(client) {
    this._registry = new BuilderRegistry()
    this._client = client
  }

  build(client) {
    if (!client) {
      client = this._client
    }
    return new Factory(client, this._registry, new FactoryCleaner(client))
  }

  register(ObjectFactory) {
    this._registry.register(ObjectFactory._type(), ObjectFactory)
  }

}
