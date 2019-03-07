# mdctl-import-adapter

Developer Tools Import Adapter for Medable
 
This module will let you import Org configurations from an exported tree layout.

## Usage

```
const ImportFileTreeAdapter = require('@medable/mdctl-import-adapter'),
      adapter = new ImportFileTreeAdapter('/documents/exported_folder'),
      iter = adapter.iterator[Symbol.asyncIterator]()
      
let item = await iter.next()
while(!item.done){      
  console.log(item.value)
  item = await iter.next()
}

// Get all blobs items

const { blobs } = adapter
if (blobs.length) {
  blobs.forEach((b) => {
    adapter.getAssetStream(b).on('data', (d) => {
      console.log(d)
    }).on('end', () => {
      console.log('end blob item')
    })
    blobs.pop()
  })
}
```
 
