# mdctl-manifest

Developer Tools Manifest Module for Medable
 
This module will let you add boilerplate objects into the Medable's manifest.
 
## Usage

You should provide a path where current manifest.json or manfiest.yaml lives.

```
const Manifest = require('@medable/mdctl-manifest'),
      tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
      options = {
        object: 'script',
        type: 'route',
        name: 'c_my_custom_route',
        format: 'json', 
        dir: tempDir
      }

await Manifest.add(options)
``` 

The code above will add a 2 new files and update manifest file.

The files will be located on the following paths
```
/env/scripts/c_my_custom_route.json
/env/scripts/js/c_my_custom_route.js
``` 
