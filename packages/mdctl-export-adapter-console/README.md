# mdctl-export-adapter-console

Developer Tools Export Console Adapter for Medable
 
This module will let you export Org configurations into the console

## Usage


```
const ExportConsoleAdapter = require('@medable/mdctl-export-adapter-console'),
      { ExportSection } = require('@medable/mdctl-core/streams/section'),
      adapter = new ExportConsoleAdapter({
        print: true // false will not print it
      })
      
adapter.write(new ExportSection({
                                  "code": "c_role_1",
                                  "name": "Role1",
                                  "object": "role",
                                  "resource": "role.c_role_1",
                                  "scope": []
                                }, 'role'))
console.log(adapter.items) // in case you want to see the items processed
adapter.end()      
```
