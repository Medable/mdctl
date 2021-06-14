import _ from 'lodash'
import Promise from 'bluebird'

const objectCreator = (client) => async function(name, ...rest) {
        const [arg1, arg2] = rest,
              isResultArray = (result) => result.data && _.isArray(result.data),
              wrapInArray = (object) => _.isArray(object) ? object : [object],
              path = arg1 && _.isString(arg1) ? arg1 : name,
              instances = _.isObject(arg1) ? wrapInArray(arg1) : wrapInArray(arg2),
              result = await Promise.mapSeries(instances, async(i) => {
                const postResult = await client.post(path, i, 250, {}, true),
                      data = isResultArray(postResult) ? _.last(postResult.data) : postResult
                return { delPath: `${path}/${data._id}`, data }
              })
                .catch(err => {
                  console.error(`Failed at ${path}`)
                  console.error(err)
                  throw err
                })
        return { [name]: result.length > 1 ? result : _.first(result) }
      },

      accountsCreator = (client) => async function(arrOfAccounts) {
        const uniqueEmail = `test-${new Date()
                .getTime()}@medable.com`,
              uniqueTag = new Date()
                .getTime(),
              defaultAcc = {
                email: `${uniqueEmail}`,
                mobile: '+1 223 772 2873',
                name: { first: 'Unit', last: 'Test' },
                // TODO check the Developer role on the server
                roles: ['000000000000000000000007'],
                password: 'qpal1010',
                stats: { mustResetPassword: false, passwordExpires: null },
                // this is a tag to easily find an account
                tag: uniqueTag
              }
        const accounts = []
        for (const acc of arrOfAccounts) {
          const accToCreate = { ...defaultAcc, ...acc },
                primaryInformation = _.pick(accToCreate, 'email', 'mobile', 'name', 'roles'),
                passwordInformation = _.pick(accToCreate, 'password', 'stats'),
                tag = _.get(accToCreate, 'tag'),
                { _id } = await client.post('org/accounts', primaryInformation, false, {}, true),
                res = await client.put(`org/accounts/${_id}`, passwordInformation)

          console.log('Account Created', accToCreate.email, _id)

          accounts.push({ delPath: `org/accounts/${res._id}`, data: { ...res, password: passwordInformation.password, tag } })
        }
        return { accounts }
      },
      sleepProm = (timeout) => {
        return new Promise((resolve) => { setTimeout(() => resolve(), timeout) })
      }

async function uploadImage(stepResponse, fileDirectoryPath, fileName, client) {

  const [upload] = stepResponse.c_value.uploads

  const FormData = require('form-data')

  const formData = new FormData()

  upload.fields.forEach(formField => formData.append(formField.key, formField.value))

  const fs = require('fs')
  const path = require('path')

  formData.append('file', fs.createReadStream(path.join(fileDirectoryPath, fileName)), fileName)

  const contentLength = await new Promise((resolve, reject) => formData.getLength((err, length) => {
    if (err) reject(err)
    resolve(length)
  }))

  const config = { requestOptions: { headers: { ...formData.getHeaders(), 'Content-Length': contentLength } } }

  await client.post(upload.uploadUrl, formData, true, config)

}

async function uploadFile(upload, fileDirectoryPath, fileName, client) {

  const FormData = require('form-data')

  const formData = new FormData()

  upload.fields.forEach(formField => formData.append(formField.key, formField.value))

  const fs = require('fs')
  const path = require('path')

  formData.append('file', fs.createReadStream(path.join(fileDirectoryPath, fileName)), fileName)

  const contentLength = await new Promise((resolve, reject) => formData.getLength((err, length) => {
    if (err) reject(err)
    resolve(length)
  }))

  const config = { requestOptions: { withCredentials: false, headers: { ...formData.getHeaders(), 'Content-Length': contentLength } } }

  const res = await client.post(upload.uploadUrl, formData, true, config)

  return res

}

function findFault(err, faultCode) {
  if (err.errCode && err.errCode === faultCode) {
    return faultCode
  } else {
    if (err.faults) {

      for (const f of err.faults) {
        const error = findFault(f, faultCode)
        if (error) {
          return error
        }
      }
    }
  }
}

function prettyLog(object) {
  console.log(JSON.stringify(object, null, ' '))
}

async function purgeObject(objectName, client, $in) {
  if (!$in) {
    const instances = await client.get(`${objectName}?limit=1000&paths[]=_id`)
    $in = instances.data.map(v => v._id)
  } else if ($in.length === 0) {
    return console.log(`Won't purge ${objectName}`)
  }

  const payload = {
    operation: 'bulk',
    ops: [{
      match: { _id: { $in } },
      object: objectName,
      operation: 'deleteMany',
      output: true
    }]
  }

  return client.post(`/${objectName}/db/bulk`, payload)
}

function addDeletionPath(objectName, id) {
  if (!objectName || !id) {
    return
  }
  if (['operationResult', 'list', 'account'].includes(objectName)) {
    return
  }
  if (objectName in global.__DELETE_PATHS__) {
    global.__DELETE_PATHS__[objectName].push(`${id}`)
  } else {
    global.__DELETE_PATHS__[objectName] = [`${id}`]
  }
}

const eventTypes = Object.freeze({
  c_televisit_event: 'c_televisit_event',
  c_visit_event: 'c_visit_event',
  c_scheduled_task_event: 'c_scheduled_task_event',
  c_dependent_task_event: 'c_dependent_task_event',
  c_ad_hoc_task_event: 'c_ad_hoc_task_event'
})

const taskAssignmentTypes = Object.freeze({
  c_ad_hoc_assignment: 'c_ad_hoc_assignment',
  c_dependent_assignment: 'c_dependent_assignment',
  c_scheduled_assignment: 'c_scheduled_assignment'
})

// polling function should return a boolean
async function pollUntil(pollingFunc, tries = 30, sleep = 1000) {
  do {

    const res = await pollingFunc()

    if (res) break

    await sleepProm(sleep)

  } while (tries--)
}

export {
  objectCreator,
  accountsCreator,
  sleepProm,
  uploadImage,
  findFault,
  prettyLog,
  purgeObject,
  eventTypes,
  taskAssignmentTypes,
  addDeletionPath,
  pollUntil,
  uploadFile
}