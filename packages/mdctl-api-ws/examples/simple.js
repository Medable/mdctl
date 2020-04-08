const { WsClient } = require('../index'),
      client = new WsClient({
        strictSSL: false,
        endpoint: 'https://api-ws-dev.medable.com',
        token: '...'
      }),
      simpleEvents = [
        'close', 'end', 'timeout',
        'online', 'offline',
        'reconnect', 'reconnected', 'reconnect scheduled', 'reconnect timeout', 'reconnect failed'
      ]

simpleEvents.forEach((event) => {
  client.on(event, () => {
    console.log('EVENT', event)
  })
})

let opened = false

client
  .on('open', () => {
    if (!opened) {
      opened = true
      setInterval(() => client.publish('role.st__admin', 'from mdctl-client'), 5000)
    }
    console.log('EVENT: open')
  })
  .on('error', (err) => {
    console.error('ERROR:', err)
  })

  // listen for topic message
  .on('publish', (message) => {
    console.log('MESSAGE:', message)
  })

client.open()

// create a jwt that includes an expiration and scopes
// as ws[ .(*|publish|subscribe)[.namespaced[.namespaced|objectId]] ]

// {
//   "aud": "https://api-ws-dev.medable.com/{env}/v2",
//   "cortex/scp": [
//     "ws.*.c_topic.c_instance"        // <-- publish allowed and subcribes to c_topic.c_instance
//     "ws"                             // <-- super-scope allows publish to all
//     "ws.subscribe"                   // <-- subscribes to all topics
//     "ws.publish.c_topic"             // <-- can publish to any or all c_topic objects
//   ],
//   "exp": 1586417939,
//   "iat": 1586317939,                 //
//   "iss": "iQBVJvL01xvPF49gNkbg02",   // <-- the app
//   "nbf": 1586317939,                 // <-- not before
//   "sub": "5e868344098ae258c8178604"  // <-- subject principal
// }
