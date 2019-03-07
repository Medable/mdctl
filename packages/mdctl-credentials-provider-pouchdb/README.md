# mdctl-credentials-provider-pouchdb

Developer Tools Credential Provider using PouchDB for Medable
 
This module will let you store your credentials into PouchDB storage.

## Usage

```
const PouchDbCredentialsProvider = require('@medable/mdctl-credentials-provider-pouchdb'),
      provider = new PouchDbCredentialsProvider({
        name: path.join(os.homedir(), '.medable/mdctl.db'),
        key: 'whatEv3rY0uW4nt@here'
      })
      
// clear credentials.      
await provider.clear()

// add a new credential 
await provider.add('env', {
        apiKey: 'abcdefghijklmnopqrstuv',
        username: 'test@medable.com',
        password: 'password'
      })  

// get the list of credentials that matches with these filters.
await provider.list('env', {
        type: 'password',
        username: 'test@medable.com'
      }) 
```
