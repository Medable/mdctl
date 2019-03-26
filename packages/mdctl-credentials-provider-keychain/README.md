# mdctl-credentials-provider-keychain

Developer Tools Credential Provider using Keychain for Medable
 
This module will let you store your credentials into Keychain storage.

## Usage

```
const KeytarCredentialsProvider = require('@medable/mdctl-credentials-provider-keychain'),
      provider = new KeytarCredentialsProvider('com.medable.mdctl')
      
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
