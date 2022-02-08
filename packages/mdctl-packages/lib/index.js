const Fault = require('@medable/mdctl-core/fault'),
      FileSource = require('./sources/file'),
      GitSource = require('./sources/git'),
      RegistrySource = require('./sources/registry'),
      NdjsonSource = require('./sources/ndjson'),
      ZipTree = require('./zip_tree'),
      sources = {
        file: FileSource,
        git: GitSource,
        ndjson: NdjsonSource,
        registry: RegistrySource
      },
      resolveSource = (name, path, options) => {
        let sourceType = 'registry'
        if (options.ndjsonStream) {
          sourceType = 'ndjson'
        } else if (path.indexOf('file://') > -1 || path === '.') {
          sourceType = 'file'
        } else if (path.indexOf('git+https://') > -1) {
          sourceType = 'git'
        }
        return new sources[sourceType](name, path, options)
      }

module.exports = {
  FileSource,
  GitSource,
  RegistrySource,
  FactorySource: (name, path, options) => resolveSource(name, path, options),
  ZipTree
}
