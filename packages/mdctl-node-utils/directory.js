const fs = require('fs')

function ensureDir(directoryPath) {
  const path = directoryPath.replace(/\/$/, '').split('/')
  path.forEach((i, k) => {
    const segment = path.slice(0, k + 1).join('/')
    if (segment && !fs.existsSync(segment)) {
      fs.mkdirSync(segment)
    }
  })
}

module.exports = {
  ensureDir
}
