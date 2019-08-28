/* eslint-disable import/no-extraneous-dependencies, no-underscore-dangle */
const nock = require('nock'),
      path = require('path'),
      fs = require('fs'),
      _ = require('lodash'),
      ndjson = require('ndjson'),
      setUp = (domain = 'https://api.local.medable.com') => {
        nock.disableNetConnect()
        // Mock request
        nock(domain)
          .defaultReplyHeaders({
            'Content-Type': 'application/ndjson',
          })
          .post('/dev/v2/c_geo_history/db/cursor', body => body.pipeline && body.pipeline.length)
          .reply(200, (uri, bodyRequest) => {
            const body = JSON.parse(bodyRequest),
                  json = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/c_geo_history.json')))
            return JSON.stringify(_.find(json, j => j._id === body.pipeline[0].$match._id))
          })

        nock(domain)
          .defaultReplyHeaders({
            'Content-Type': 'application/ndjson',
          })
          .post('/dev/v2/c_geo_history/db/cursor', body => !body.pipeline)
          .reply(200, () => fs.createReadStream(path.join(__dirname, '../data/c_geo_history.ndjson')).pipe(ndjson.parse()).pipe(ndjson.stringify()))


        nock(domain)
          .defaultReplyHeaders({
            'Content-Type': 'application/json',
          })
          .post('/dev/v2/c_geo_history/db/insertOne')
          .reply(201, (url, bodyRequest) => {
            const json = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/c_geo_history.json')))
            Object.assign(json[0], bodyRequest.document)
            return JSON.stringify(json[0])
          })

        nock(domain)
          .defaultReplyHeaders({
            'Content-Type': 'application/json',
          })
          .post('/dev/v2/c_geo_history/db/insertMany')
          .reply(201, (url, bodyRequest) => {
            const json = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/c_geo_history.json'))),
                  result = []
            bodyRequest.documents.forEach((f, k) => {
              result.push(_.extend(json[k], f))
            })
            return JSON.stringify(result)
          })

        nock(domain)
          .defaultReplyHeaders({
            'Content-Type': 'application/json',
          })
          .post('/dev/v2/c_geo_history/db/count')
          .reply(201, () => {
            const json = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/c_geo_history.json')))
            return json.length
          })

        nock(domain)
          .defaultReplyHeaders({
            'Content-Type': 'application/json',
          })
          .post('/dev/v2/c_geo_history/db/count')
          .reply(201, () => {
            const json = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/c_geo_history.json')))
            return json.length
          })
      },
      restore = () => {
        nock.cleanAll()
      }

module.exports = {
  setUp,
  restore
}
