const randomBytes = require('randombytes'),
      { rInt, rString } = require('./values'),
      alphaNumChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      allChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'


let Undefined

function secureRandomInt(minimum, maximum) {

  const bytes = randomBytes(8),
        rand = bytes.readUInt32LE(0)

  if (minimum !== Undefined) {

    let min = rInt(minimum, 0),
        max = rInt(maximum, 0)

    if (min > max) {
      [min, max] = [max, min]
    }
    const diff = max - min + 1
    return Math.floor(diff * rand / 0xffffffff) + min

  }

  return rand
}

function randomChars(set, length) {

  const chars = rString(set, allChars),
        len = rInt(length, 0),
        buf = Buffer.allocUnsafe(len),
        max = set.length - 1

  for (let i = 0; i < len; i += 1) {
    buf.write(chars[secureRandomInt(0, max)], i, 1)
  }
  return buf.toString()

}

function randomAlphaNum(length) {

  return randomChars(alphaNumChars, length)
}

function randomAlphaNumSym(length) {

  return randomChars(allChars, length)

}



module.exports = {
  secureRandomInt,
  randomAlphaNum,
  randomAlphaNumSym,
  randomChars
}
