
export default class BuilderRegistry {

  constructor() {
    this.registry = {}
  }

  register(_type, Builder) {
    this.registry[_type] = Builder
  }

  getBuilder(_type) {
    const builder = this.registry[_type]
    if (!builder) {
      throw new Error(`Unknown Builder Type: ${_type}`)
    }
    return builder
  }

}