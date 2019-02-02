const crypto = require('crypto'),
      fs = require('fs'),
      { rInt } = require('./values'),
      alphaNumChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

let Undefined

function secureRandomInt(minimum, maximum) {

  const bytes = crypto.randomBytes(8),
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

function randomAlphaNum(length) {

  const len = rInt(length, 0),
        buf = Buffer.allocUnsafe(len),
        max = alphaNumChars.length - 1

  for (let i = 0; i < len; i += 1) {
    buf.write(alphaNumChars[secureRandomInt(0, max)], i, 1)
  }
  return buf.toString()

}

function md5FileHash(filename) {
  const size = 8192,
        fd = fs.openSync(filename, 'r'),
        hash = crypto.createHash('md5'),
        buffer = Buffer.alloc(size)

  try {
    let bytesRead

    do {
      bytesRead = fs.readSync(fd, buffer, 0, size)
      hash.update(buffer.slice(0, bytesRead))
    } while (bytesRead === size)
  } finally {
    fs.closeSync(fd)
  }

  return hash.digest('hex')
}

module.exports = {
  secureRandomInt,
  randomAlphaNum,
  md5FileHash
}
