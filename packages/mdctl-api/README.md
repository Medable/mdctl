# mdctl-api

Developer Tools Api module

## Usage

- Client

You can use any credential provider into the credentials object param.
such as [keychain](../mdctl-credentials-provider-keychain), [keychain](../mdctl-credentials-provider-puchdb) or
[memory](../mdctl-core/credentials/memory_provider) 
```
client = new Client({
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
          })
```
If you don't send that information it will try to find these credentials automatically.

- Environment

Environment is a wrapper for calling import/export endpoints.

```
Environment.export({
    client,
    stream,
    dir: [location to export data],
    format: 'yaml'
})
```

```
Environment.import({
  client,
  gzip: true, //will send the stream into gzip format
  dir: [location to load data],
  format: 'yaml',
  progress: (line) => {
    console.log(line) //here you will see what is going to be sent
  }
})
```
