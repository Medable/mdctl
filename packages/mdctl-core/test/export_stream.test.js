/* eslint-disable no-underscore-dangle, max-len */
const assert = require('assert'),
      sinon = require('sinon'),
      ExportStream = require('../streams/export_stream'),
      Fault = require('../fault'),
      { ExportSection, StreamChunk } = require('../streams/section')

describe('ExportStream', () => {
  let exportStream

  beforeEach(() => {
    exportStream = new ExportStream()
  })

  it('should initialize with empty runtimes array and completed set to false', () => {
    assert.deepStrictEqual(exportStream.runtimes, [])
    assert.deepStrictEqual(exportStream.sectionsWithResources, [])
    assert.strictEqual(exportStream.completed, false)
  })

  it('should return the value of completed property', () => {
    assert.strictEqual(exportStream.complete(), false)
    exportStream.completed = true
    assert.strictEqual(exportStream.complete(), true)
  })

  it('should check if a given name is in the allowed keys', () => {
    assert.strictEqual(exportStream.checkKeys('object'), true)
    assert.strictEqual(exportStream.checkKeys('facet'), true)
    assert.strictEqual(exportStream.checkKeys('app'), true)
    assert.strictEqual(exportStream.checkKeys('config'), true)
    assert.strictEqual(exportStream.checkKeys('invalid-key'), false)
  })

  it('should transform and push ExportSection when the object is in the allowed keys', () => {
    const chunk = { object: 'object' },
          pushSpy = sinon.spy(exportStream, 'push')

    exportStream._transform(chunk, null, () => {})

    sinon.assert.calledWith(pushSpy, new ExportSection(chunk, chunk.object, exportStream.sectionsWithResources))
  })

  it('should transform and push StreamChunk when the object is "stream"', () => {
    const chunk = { object: 'stream' },
          pushSpy = sinon.spy(exportStream, 'push')

    exportStream._transform(chunk, null, () => {})

    sinon.assert.calledWith(pushSpy, new StreamChunk(chunk, chunk.object))
  })

  it('should add runtime chunk to the runtimes array when the object is "runtime-resource"', () => {
    const chunk = { object: 'runtime-resource' }

    exportStream._transform(chunk, null, () => {})

    assert(exportStream.runtimes.includes(chunk))
  })

  it('should set completed to true when the object is "manifest-exports"', () => {
    const chunk = { object: 'manifest-exports' }

    exportStream._transform(chunk, null, () => {})

    assert.strictEqual(exportStream.completed, true)
  })

  it('should callback with a Fault when the chunk does not have an object property', () => {
    const callback = sinon.stub()

    exportStream._transform({}, null, callback)

    sinon.assert.calledWith(callback, sinon.match.instanceOf(Fault))
  })

  it('should callback with a Fault when the chunk object is "fault"', () => {
    const chunk = { object: 'fault' },
          callback = sinon.stub()

    exportStream._transform(chunk, null, callback)

    sinon.assert.calledWith(callback, sinon.match.instanceOf(Fault))
  })

  it('should ignore unhandled chunks', () => {
    const chunk = { object: 'unhandled' },
          callback = sinon.stub()

    exportStream._transform(chunk, null, callback)

    sinon.assert.calledWith(callback)
  })

  it('should flush the runtimes array as an ExportSection', () => {
    const done = sinon.stub(),
          pushSpy = sinon.spy(exportStream, 'push')

    exportStream.runtimes = [{ object: 'runtime-resource' }]

    exportStream._flush(done)

    sinon.assert.calledWith(pushSpy, new ExportSection(exportStream.runtimes, 'resources'))
    sinon.assert.called(done)
  })
})
