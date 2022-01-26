const Package = require('../../../mdctl-packages'),
      { Registry, Cortex } = require('../package/source'),
      publishPkg = async(name, params) => {
        const {
                source, registryUrl, registryProjectId, registryToken, client
              } = params,
              pkg = new Package(name, '.')

        await pkg.evaluate()

        let srcClient

        if (source === 'registry') {
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
