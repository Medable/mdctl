import _ from 'lodash'
import Promise from 'bluebird'
import fs from 'fs'
import path from 'path'
import { prettyLog } from '../helpers'

const Provisioner = (client) => {

  let provisionedData = {}

  const CACHE_FILE = path.resolve(`${__dirname}/provisioned-data.json`),

        getDelPaths = (provisionedData) => {
          let res = []
          for (const d in provisionedData) {
            let currentData = provisionedData[d]
            res = _.isObject(currentData) ? res.concat(getDelPaths(currentData))
              : d === 'delPath' ? res.concat([currentData])
                : res
          }
          return _(res)
            .compact()
            .value()
        },

        getObjectsForDeletion = (provisionedData) => {
          let data = []
          for (const d in provisionedData) {
            let test = provisionedData[d]
            if (_.isObject(test)) {
              for (const objectName in test) {
                const objects = test[objectName]
                if (Array.isArray(objects)) {
                  for (const obj of objects) {
                    if (obj.data && obj.data.object && obj.data._id) {

                      let bulkEntry = data.find(v => v.object === obj.data.object)

                      if (!bulkEntry) {
                        bulkEntry = {
                          match: { _id: { '$in': [] } },
                          object: obj.data.object,
                          operation: 'deleteMany',
                          output: true
                        }
                        data.push(bulkEntry)
                      }
                      bulkEntry.match._id['$in'].push(obj.data._id)
                    }
                  }
                } else {
                  let obj = objects
                  if (obj.data.object && obj.data._id) {

                    let bulkEntry = data.find(v => v.object === obj.data.object)

                    if (!bulkEntry) {
                      bulkEntry = {
                        match: { _id: { '$in': [] } },
                        object: obj.data.object,
                        operation: 'deleteMany',
                        output: true
                      }
                      data.push(bulkEntry)
                    }
                    bulkEntry.match._id['$in'].push(obj.data._id)
                  }
                }
              }
            }
          }
          return data
        },

        writeCache = (provisionedData) => {
          return new Promise((resolve, reject) => {
            fs.writeFile(CACHE_FILE, JSON.stringify(provisionedData), (err) => {
              err && reject(err)
              resolve(true)
            })
          })
        },

        removeCache = () => {
          return new Promise((resolve) => {
            fs.unlink(CACHE_FILE, (err) => {
              if (err) {
                console.error(err)
              }
              resolve()
            })
          })
        },

        readCache = (tag) => {
          return new Promise((resolve, reject) => {
            fs.stat(CACHE_FILE, (err) => {
              err && resolve(undefined)
              fs.readFile(CACHE_FILE, (err, data) => {
                err && reject(err)
                const parsedCache = data && JSON.parse(data)
                const result = tag && parsedCache ? parsedCache[tag]
                  : !tag && parsedCache ? parsedCache
                    : undefined
                resolve(result)
              })
            })

          })
        },

        // ideally this should be part of the helpers but as we are reading from a
        // cached file (and these enhancements are not serializables)
        // we need to enforce their existence at this level
        // sorry about this
        enhanceProvisionedData = (provisionedData, currDepth) => {
          // do not enhance more than 1 level deep
          let depth = currDepth || 0
          for (const key in provisionedData) {
            let currentProvData = provisionedData[key]
            if (_.isArray(currentProvData)) {
              if (key === 'accounts') { // if you call it diferently at provisioning time this wont work :(
                const loginWithCreds = (account) => async() => {
                  const creds = _.pick(account, 'email', 'password'),
                        newClient = client.clientForCreds(creds)
                  await newClient.login()
                  return newClient
                }
                currentProvData = currentProvData.map(acc => ({ ...acc, data: { ...acc.data, login: loginWithCreds(acc.data) } }))
              }
              provisionedData[key] = new ProvisioningArray(...currentProvData)
            } else if (_.isObject(currentProvData) && depth < 1) {
              depth = 1
              provisionedData[key] = enhanceProvisionedData(currentProvData, depth)
            }
          }
          return provisionedData
        }

  return {
    async run(provArrayGenerator, tag) {
      const provisioningArr = provArrayGenerator(client),
            data = await Promise
              .reduce(provisioningArr, async(sum, currFunc) => {
                let res = {}
                try {
                  res = await currFunc(sum)
                } catch (err) {
                  console.error(`[${currFunc.name}] provisioning failed...`, err)
                }
                return _.extend(sum, enhanceProvisionedData(res))
              }, {})
      provisionedData = await readCache() || provisionedData
      provisionedData = tag
        ? { ...provisionedData, [tag]: data }
        : { ...provisionedData, ...data }
      await writeCache(provisionedData)
      return provisionedData
    },

    async getData(tag) {
      const res = await readCache(tag)
      return enhanceProvisionedData(res)
    },

    async clean() {

      await client.post(`/cache/key/orphan_records_disabled`, {})

      const dataToDelete = _.isEmpty(provisionedData) ? await readCache() : provisionedData

      const objDel = getObjectsForDeletion(dataToDelete)
      const accounts = objDel.find(v => v.object === 'account')
      const ops = objDel.filter(v => v.object !== 'account')

      let payload = {
        operation: 'bulk',
        ops
      }

      try {

        await client.post('/accounts/db/bulk', payload)

      } catch (err) {

        console.error('some data was not successfully deleted')

      }

      if (accounts) {
        for (const accId of accounts.match._id['$in']) {
          try {
            await client.delete(`org/accounts/${accId}`)
          } catch (err) {

            console.error('some acc was not successfully deleted')

            if (err.statusCode !== 404) {
              // we are commenting this because it is too verbose in the current config
              // console.error(`Something went wrong when deleting org/accounts/${accId}`)
              // console.error(err)
            }
          }
        }

      }

      await client.delete('/cache/key/orphan_records_disabled')

      const provisionedDataFile = `${__dirname}/provisioned-data.json`

      if (fs.existsSync(provisionedDataFile)) {

        fs.unlinkSync(provisionedDataFile)

      }

    }
  }
}

class ProvisioningArray extends Array {

  find(predicate) {
    const dataArr = this.map(x => x.data)
    return _.isNumber(predicate)
      ? dataArr[predicate]
      : _.find(dataArr, predicate)
  }

}

export default Provisioner
