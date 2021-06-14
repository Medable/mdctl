/* eslint-disable no-undef */
import Provisioner from '../provisioner'
import Promise from 'bluebird'
import path from 'path'
import Api from '../api'
import glob from 'glob'

export default async function(globalConfig) {
  global.__API__ = {
    strictSSL: false,
    requestOptions: {
      headers: {
        locale: 'en_US'
      }
    },
    environment: {
      endpoint: 'api-int-dev.medable.com',
      env: process.env.JEST_ENV
    },
    credentials: {
      type: 'token',
      token: process.env.JEST_TOKEN,
      apiKey: process.env.JEST_API_KEY
    }
  }
  let provisioningGlobPath = (process.env.PERMISSIONS_ONLY && `./__tests__/AXONCONFIG-perm/*.provisioning.js`) || `./__tests__/!(AXONCONFIG-perm)/*.provisioning.js`
  const client = Api(global.__API__),
        provisioner = Provisioner(client),
        [testPattern] = globalConfig.testPathPattern && path.basename(globalConfig.testPathPattern)
          .split('.')

  // disable orphan records lib
  return new Promise((resolve, reject) => {
    glob(provisioningGlobPath, (err, files) => {
      err && reject(err)
      Promise.each(files, async(f) => {
        try {
          const [dataTag] = path.basename(f)
                  .split('.'),
                { default: generator } = require(path.resolve(f))
          // if test pattern is specified then only provision test pattern data
          if (testPattern && testPattern !== dataTag) return
          await provisioner.run(generator, dataTag)
        } catch (err) {
          reject(err)
        }
      })
        .then(() => {
          resolve()
        })
        .catch(err => {
          console.error(err)
        })
    })
  })
}
