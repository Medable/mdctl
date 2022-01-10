const { isSet } = require('@medable/mdctl-core-utils/values'),
      Package = require('../../../mdctl-packages'),
      { Registry, Cortex } = require('../package/source'),
      publishPkg = async(name, params) => {
        const {
                source, registryUrl, registryProjectId, registryToken, client
              } = params,
              pkg = new Package(name, '.')

        await pkg.evaluate()

        let srcClient

        if (source === 'registry') {
          if (!isSet(registryUrl)) {
            throw Error('Registry url is required for registry publishing')
          }

          if (!isSet(registryProjectId)) {
            throw Error('Registry project id is required for registry publishing')
          }

          if (!isSet(registryToken)) {
            throw Error('Registry token is required for registry publishing')
          }

          srcClient = new Registry(pkg.name, pkg.version, {
            registryUrl,
            registryProjectId,
            registryToken
          })
        } else {
          srcClient = new Cortex(pkg.name, pkg.version, {
            client
          })
        }

        try {
          await srcClient.publishPackage(await pkg.getPackageStream())
        } catch (err) {
          throw err
        }
      }

module.exports = publishPkg
