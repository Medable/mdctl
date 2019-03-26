# mdctl-sandbox
 
 Developer Tools Sandbox Module for Medable
 
 This module will let you run scripts into the Medable's sandbox.
 
## Usage

```
const { Client } = require('@medable/mdctl-api'),
      sandbox = require('@medable/mdctl-sandbox'),
      options = {
        client: new Client({
          strictSSL: false,
          environment: {
            endpoint: 'https://localhost',
            env: 'test'
          },
          credentials: {
            type: 'password',
            apiKey: 'abcdefghijklmnopqrstuv',
            username: 'test@medable.com',
            password: 'password'
          }
        }),
        stats: true,
        body: `
          const sum = (param1, param2) => {
            return param1 + param2
          }
          
          return sum(5,1)
        `,
        arguments: [],
        script: '',
        optimize: false,
        format: 'json'
      },
      response = {}

try {
  Object.assign(response, await sandbox.run(options))
} catch (e) {
  response.err = e.toJSON()
}

console.log(JSON.stringify(response))
```  
