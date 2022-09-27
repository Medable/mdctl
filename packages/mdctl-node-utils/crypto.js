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

function hashCode(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};


module.exports = {
  md5FileHash, 
  hashCode
}
