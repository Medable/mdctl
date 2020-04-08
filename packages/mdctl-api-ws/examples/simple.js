const { WsClient } = require('../index'),
      client = new WsClient({
        strictSSL: false,
        endpoint: 'https://api-ws-dev.medable.com',
        token: '...'
      })

client
  .on('open', () => {
    console.log('first opened')
    setInterval(() => client.publish('t__opic.instance', 'from mdctl-client'),
      5000)

  })
  .on('close', () => {
    console.log('closed')
    process.exit()
  })
  .on('connect', () => {
    console.log('[re]connected')
  })
  .on('disconnect', () => {
    console.log('disconnected')
  })
  .on('error', (err) => {
    console.log('err', err)
  })
  .on('online', () => {
    console.log('browser online')
  })
  .on('offline', () => {
    console.log('browser offline')
  })
  .on('fault', (err, disconnecting) => {
    console.log({disconnecting, err})
  })

  // listen for topic message
  .on('publish', (message) => {
    console.log('received topic message', message)
  })

client.open()

// create a jwt that includes an expiration and scopes as ws[ .(*|publish|subscribe)[.namespaced[.namespaced|objectId]] ]

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
