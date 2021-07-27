const fs = require('fs'),
      path = require('path'),
      { parseString } = require('@medable/mdctl-core-utils/values'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      Source = require('./source')

class FileSource extends Source {

  async getPackageInfo() {
    // eslint-disable-next-line no-underscore-dangle
    const _path = this.properties.path.replace('file://', ''),
          pkgInfo = await this.readConfigFiles(_path)
    if(!pkgInfo) {
      throw Error('Package.json not exists')
    }
    return pkgInfo
  }

}

module.exports = FileSource
