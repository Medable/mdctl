const Package = require('@medable/mdctl-packages'),
      { Cortex } = require('../package/source'),
      installPkg = async(name, params) => {
        let tmpName = name

        if (name && name.startsWith('--')) {
          // No package name specified after `mdctl package install`, but an option
          // So assign name to an empty string to install a local package at the current
          // working directory where the mdctl command is executed.
          tmpName = ''
        }

        // If pkgName is empty, then this is a local package.
        // Otherwise, it is a remote package.
        const {
                registryUrl, registryProjectId, registryToken, client
              } = params,
              options = { registryUrl, registryProjectId, registryToken },
              [pkgName, pkgVersion] = tmpName.split('@'),
              isLocalPkg = pkgName === '',
              pkg = new Package(pkgName, isLocalPkg ? '.' : pkgVersion || 'latest', null, options)

        await pkg.evaluate()

        // eslint-disable-next-line one-var
        const srcClient = new Cortex(pkg.name, pkg.version, {
          client
        })

        try {
          await srcClient.installPackage(pkg)
        } catch (err) {
          throw err
        }
      }

module.exports = installPkg
