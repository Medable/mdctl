const crypto = require('crypto'),
    {sortKeys, searchParamsToObject} = require('@medable/mdctl-core-utils'),
    _ = require('lodash'),
    {naturalCmp, rString, pathTo, rBool, isCustomName} = require('@medable/mdctl-core-utils/values'),
    fs = require('fs'),
    {loadJsonOrYaml} = require('@medable/mdctl-node-utils'),
    globby = require('globby'),
    {pluralize} = require('inflection'),
    ImportFileTreeAdapter = require('@medable/mdctl-import-adapter'),
    ImportStream = require('@medable/mdctl-core/streams/import_stream'),
    {Transform, PassThrough} = require('stream'),
    {URL} = require('url'),
    pump = require('pump'),
    ndjson = require('ndjson'),
    {Fault} = require('@medable/mdctl-core')

const compare = async (inputDir, client, options = {}, requestOptions = {}) => {
    // call compare data with resources
    pathTo(requestOptions, 'headers.accept', 'application/x-ndjson')
    requestOptions.headers['Content-Type'] = 'application/x-ndjson'
    requestOptions.json = false
    const { stream } = await processManifest(inputDir, options.format),
          compareUrl = new URL('/developer/environment/compare', client.environment.url),
          query = {
            debug: rBool(options.debug, false),
            color: rBool(options.color, false),
            object: rBool(options.object, false)
          }
    const response = await client.call(compareUrl.pathname, {
      method: 'POST',
      body: pump(stream, ndjson.stringify()),
      stream: new PassThrough(),
      query,
      requestOptions
    })
    return new Promise((resolve, reject) => {
      let buffer = [],
        jsonBuffer = []
      response.on('data', d => {
        let data = {}
        try {
          data = JSON.parse(d)
        } catch (e) {
          const strData = d.toString()
          jsonBuffer.push(d)
          if (strData.substr(strData.length - 2) === '}\n') {
            data = JSON.parse(Buffer.concat(jsonBuffer).toString())
            jsonBuffer = []
          } else {
            return
          }
        }

        const { __type: type } = data

        if (type === 'LOG' && options.debug) {
          console.log(data)
        } else if (type === 'DIFFERENCE') {
          buffer.push(data)
        } else if (data.object === 'fault') {
          reject(Fault.create(data.code, data))
        }

      })
        .on('error', e => reject(e))
        .on('end', () => {
          resolve(buffer)
        })
    })
    // Parse differences and construct new stream out
  },
  getHash = (object) => {
    return crypto.createHash('sha256').update(JSON.stringify(object)).digest('hex')
  },
  sortResource = (resource, deep = false) => {
    switch (resource.object) {
      case 'template':
        resource.localizations.forEach(loc => {
          loc.content = loc.content.map(v => sortKeys(_.omit(v, '_id', 'mime'))).sort((a, b) => naturalCmp(a.name, b.name))
        })
        break
      case 'notification':
        resource.endpoints = resource.endpoints.map(e => sortKeys(e)).sort((a, b) => naturalCmp(a.name, b.name))
        break
      case 'role':
        resource.include && resource.include.sort(naturalCmp)
        break
      case 'view':
        resource.limit = sortKeys(resource.limit)
        resource.skip = sortKeys(resource.skip)
        resource.paths = sortKeys(resource.paths)
        resource.paths.defaultValues && resource.paths.defaultValues.sort(naturalCmp)
        resource.paths.limitTo && resource.paths.limitTo.sort(naturalCmp)
        resource.query && resource.query.sort((a, b) => naturalCmp(rString(a.name, ''), rString(b.name, '')))
        break
      case 'object':
        if (resource.properties) {
          resource.properties = sortKeys(resource.properties.sort((a, b) => naturalCmp(rString(a.name, ''), rString(b.name, ''))))
          resource.properties.forEach(p => {
            if (p.type === 'Document') {
              p.properties = p.properties && sortKeys(p.properties.sort((a, b) => naturalCmp(rString(a.name, ''), rString(b.name, ''))))
            }
          })
        }
        break
    }
    return sortKeys(resource, deep)
  },
  processManifest = async (inputDir, format) => {
    const manifestPath = `${inputDir}/manifest.${format}`
    let manifest = {}
    if (fs.existsSync(manifestPath)) {
      manifest = await loadJsonOrYaml(manifestPath)
      const entries = Object.keys(manifest)
      for (const key of entries) {
        if (key === 'object') {
          continue
        }
        const item = manifest[key],
          includes = key === 'objects' ? item : item?.includes
        if (includes && key !== 'env') {
          for (const inc of includes) {
            if (inc === '*') {
              const starPaths = globby.sync([`**/${pluralize(key)}/*.${format}`], {cwd: inputDir})
              item.includes = starPaths.map(p => {
                const parts = p.split('/'),
                  lastPart = parts[parts.length - 1]
                return lastPart.replace(`.${format}`, '')
              })
            }
          }
        }
      }
    }
    const fileAdapter = new ImportFileTreeAdapter(inputDir, format, manifest),
      importStream = new ImportStream(fileAdapter),
      transform = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          // get hash and attach it to the object
          chunk.hash = getHash(sortResource(chunk))
          this.push(chunk)
          callback()
        }
      })
    return { stream: importStream.pipe(transform), manifest }
  },
  buildManifest = (changes) => {
    let manifest = {  object: 'manifest' }
    for(const change of changes) {

      const { name, resource, __new = {} } = change.differences,
            parts = (resource || __new.resource).split('.'),
            resourceName = name || __new.name,
            key = parts[0]
      if(key === 'env') {
        manifest[key] = {includes: ['*']}
      } else if(key === 'object' ) {
        if(!manifest[pluralize(key)]) {
          manifest[pluralize(key)] = []
        }
        const exists = manifest[pluralize(key)].find(o => o.name === resourceName)
        if(!exists) {
          manifest[pluralize(key)].push({
            includes: ['*'],
            name: resourceName
          })
        } else {
          exists.includes.push(resourceName)
        }
      } else {
        const k = isCustomName(key) ? key : pluralize(key)
        if(!manifest[k]) {
          manifest[k] = {
            includes: [parts.slice(1).join('.')]
          }
        } else {
          manifest[k].includes.push(parts.slice(1).join('.'))
        }
      }
    }
    return manifest
  }

module.exports = {
  compare,
  buildManifest
}
