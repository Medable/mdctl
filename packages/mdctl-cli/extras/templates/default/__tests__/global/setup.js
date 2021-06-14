jest.setTimeout(240000)

const Api = require('../api').default

const Provisioner = require('../provisioner').default

const { sleepProm, purgeObject } = require('../helpers')

global.__API__ = {
  strictSSL: false,
  requestOptions: {
    headers: {
      locale: 'en_US'
    }
  },
  environment: {
    endpoint: process.env.JEST_ENDPOINT || 'api-int-dev.medable.com',
    env: process.env.JEST_ENV
  },
  credentials: {
    type: 'token',
    token: process.env.JEST_TOKEN,
    apiKey: process.env.JEST_API_KEY
  }
}

const { existsSync } = require('fs')

const client = Api(global.__API__)

const provisioner = Provisioner(client)

const fileNameParts = global.jasmine.testPath.split('/')

const fileName = fileNameParts.pop()

const [tagName] = fileName.split('.')

const path = fileNameParts.join('/')

beforeAll(async() => {

  const provisioningPath = `${path}/${tagName}.provisioning.js`

  if (existsSync(provisioningPath)) {

    const generator = require(provisioningPath).default

    await provisioner.run(generator, tagName)

  }

})

afterAll(async() => {

  await provisioner
    .clean()

  try {
    for (const objectName in global.__DELETE_PATHS__) {
      try {
        await purgeObject(objectName, client, global.__DELETE_PATHS__[objectName])
      } catch (error) {
        console.error('Clean up failed', error)
      }
    }
  } finally {
    global.__DELETE_PATHS__ = {}
  }
})
