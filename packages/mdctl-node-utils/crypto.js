const createHash = require('create-hash'),
      fs = require('fs')


function md5FileHash(filename) {
  const size = 8192,
        fd = fs.openSync(filename, 'r'),
        hash = createHash('md5'),
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
  md5FileHash
}
