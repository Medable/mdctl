const { assert } = require('chai'),
      fs = require('fs'),
      Stream = require('../src/cli/stream'),
      FileAdapter = require('../src/cli/stream/adapters/file_adapter')

describe('Adapters', () => {

  it('export using adapters', (done) => {
    const stream = fs.createReadStream('/Users/gastonrobledo/Downloads/blob.json'),
          s = new Stream(),
          c = new FileAdapter(null, 'yaml')

    stream.pipe(s).pipe(c)

  })

})
