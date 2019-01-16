const { assert } = require('chai'),
      Stream = require('../src/cli/stream')

describe('Adapters', () => {

  it('export using adapters', async() => {
    const blob = require('/Users/gastonrobledo/Downloads/blob.json'),
          c = new Stream(blob)
    c.addOutputList([Stream.output.FILE, Stream.output.MEMORY])
    const m = await c.save()
    console.log(m)
  })

})
