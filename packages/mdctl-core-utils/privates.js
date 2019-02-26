
const { pathTo } = require('./values'),
      privatesAccessor = createAccessor()

let Undefined

function createAccessor() {

  const pp = new WeakMap()
  return (instance, property = Undefined, value = Undefined) => {

    let p = pp.get(instance)
    if (!p) {
      p = {}
      pp.set(instance, p)
    }
    if (property !== Undefined) {
      if (value !== Undefined) {
        pathTo(p, property, value)
      } else {
        return pathTo(p, property)
      }
    }
    return p
  }

}

module.exports = {
  createAccessor,
  privatesAccessor
}
