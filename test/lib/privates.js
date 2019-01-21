const { assert } = require('chai'),
      { privatesAccessor } = require('../../src/lib/privates')

class PrivatesParts {

  constructor() {

    Object.assign(privatesAccessor(this), {
      a: 1,
      b: 2,
      c: 3
    })

  }

  get a() {
    return privatesAccessor(this).a
  }

  get b() {
    return privatesAccessor(this).b
  }

  set b(b) {
    privatesAccessor(this).b = b
  }

  get c() {
    return privatesAccessor(this, 'c')
  }

  set c(c) {
    privatesAccessor(this, 'c', c)
  }


}

describe('Privates', () => {

  it('should work to get and set private properties', () => {

    const v = new PrivatesParts()

    assert(v.a === 1)

    assert(v.b === 2)
    v.b = 22
    assert(v.b === 22)

    assert(v.c === 3)
    v.c = 33
    assert(v.c === 33)

  })

})
