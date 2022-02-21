# mdctl-axon-tools :: Tools For interaction with Axon orgs

Axon Tools Module

This module provides tools for interacting with axon orgs

### How to use
```
const { Client } = require('@medable/mdctl-api'),
      { StudyManifestTools } = require('@medable/mdctl-axon-tools'),
      exportEnv = require('../lib/env/export'),
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
        


async function exportStudy(client) {

    const studyTools = new StudyManifestTools(client, params)

    const { manifest } = await studyTools.getStudyManifest()
    const options = {
        format: 'json',
        manifest
    }
    console.log('Starting Study Export')
    await exportEnv({ client, ...options })

}

exportStudy(client) 
````
