# mdctl-export-adapter-tree

Developer Tools Export Tree Adapter for Medable
 
This module will let you export Org configurations in a tree layout format.

## Usage

```
const ExportFileTreeAdapter = require('@medable/mdctl-export-adapter-tree'),
      { ExportSection } = require('@medable/mdctl-core/streams/section'),
      adapter = new ExportFileTreeAdapter('/documents/export_org', {
        format: 'json',
        clear: true // this will remove all files on target folder
      })
      
adapter.write(new ExportSection({
                                  "code": "c_role_1",
                                  "name": "Role1",
                                  "object": "role",
                                  "resource": "role.c_role_1",
                                  "scope": []
                                }, 'role'))
adapter.end()      
```
