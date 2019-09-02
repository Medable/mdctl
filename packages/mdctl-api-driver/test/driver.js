/* global org */
/* eslint-disable no-underscore-dangle */
require('../index')
const { assert } = require('chai'),
      { setUp, restore } = require('./lib/mock')

describe('Db Driver Tests', () => {

  before(() => {
    setUp()
  })

  after(() => {
    restore()
  })

  it('test using aggregate method', async() => {
    const result = await org.objects.c_geo_history.aggregate([
      { $match: { _id: '5d52d176bb652c661e96d9dg' } }
    ]).toArray()
    assert(result[0]._id === '5d52d176bb652c661e96d9dg', 'the _id does not match')
  })

  it('test using count method', async() => {
    const result = await org.objects.c_geo_history.count()
    assert(result === 2, 'total should be 2')
  })

  it('test using find method', async() => {
    const result = await org.objects.c_geo_history.find().toArray()
    assert(result.length === 2, 'the length should be 2')
  })

  it('test using insertOne method', async() => {
    const result = await org.objects.c_geo_history.insertOne({
      c_prop1: {
        type: 'Point',
        coordinates: [
          34,
          -92
        ]
      }
    }).execute()
    assert(result.c_prop1.coordinates[0] === 34, 'latitude does not matches')
    assert(result.c_prop1.coordinates[1] === -92, 'longitude does not matches')
  })

  it('test using insertMany method', async() => {
    const result = await org.objects.c_geo_history.insertMany([{
      c_prop1: {
        type: 'Point',
        coordinates: [
          34,
          -92
        ]
      }
    }, {
      c_prop1: {
        type: 'Point',
        coordinates: [
          55,
          -55
        ]
      }
    }]).execute()
    assert(result[0].c_prop1.coordinates[0] === 34, 'latitude for first object does not matches')
    assert(result[0].c_prop1.coordinates[1] === -92, 'longitude for first object does not matches')
    assert(result[1].c_prop1.coordinates[0] === 55, 'latitude for second object does not matches')
    assert(result[1].c_prop1.coordinates[1] === -55, 'longitude for second object does not matches')
  })

  it('test using deleteOne method', async() => {
    const result = await org.objects.c_geo_history.deleteOne({ _id: '5d557682f722f511204e57c0' }).execute()
    assert(result === true, 'object should be deleted')
  })

  it('test using deleteMany method', async() => {
    const result = await org.objects.c_geo_history.deleteMany({ _id: { $in: ['5d557682f722f511204e57c0', '5d557682f722f511204e34c7'] } }).execute()
    assert(result === true, 'objects should be deleted')
  })

  it('test using readOne method', async() => {
    const result = await org.objects.c_geo_history.readOne({ _id: '5d52d176bb652c661e96d9df' }).execute()
    assert(result._id === '5d52d176bb652c661e96d9df', 'objects id should be 5d52d176bb652c661e96d9df')
  })

  it('test using updateOne method', async() => {
    const result = await org.objects.c_geo_history.updateOne({ _id: '5d52d176bb652c661e96d9df' }, {
      $set: {
        c_prop1: {
          coordinates: [99, -100]
        }
      }
    }).execute()
    assert(result === '5d52d176bb652c661e96d9df', 'id of updated object should be returned')
  })

  it('test using updateMany method', async() => {
    const result = await org.objects.c_geo_history.updateMany({ c_name: 'test' }, {
      $set: {
        c_name: 'test1'
      }
    }).execute()
    assert(result.updatedIds.length === 2, 'the length of updated documents should match')
  })

  it('test using patchOne method', async() => {
    // TODO:
  })

  it('test using patchMany method', async() => {
    // TODO:
  })

  it('test using bulk method', async() => {
    // TODO:
  })


})
