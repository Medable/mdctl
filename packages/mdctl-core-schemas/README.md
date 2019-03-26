# mdctl-core-schemas

Developer Tools Core Schemas Module for Medable
 
This module will provide a set of schema templates to be used in other modules.

## Usage

```
const { templates } = require('@medable/mdctl-core-schemas'),
      template = await templates.create('script', 'route', 'c_my_script')

console.log(template.getBoilerplate())
```
