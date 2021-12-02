# mdctl-axon-tools :: Tools For interaction with Axon orgs

Axon Tools Module

This module provides tools for interacting with axon orgs

### How to use
```
const { Client } = require('@medable/mdctl-api')
const { Driver } = require('@medable/mdctl-api-driver')
const { CortexObject } = require('@medable/mdctl-api-driver/lib/cortex.object')

// a global org object will be created using the default mdctl credentials

const result = await org.objects.c_my_object.find() // will return a Transform stream.
const result = await org.objects.c_my_object.find().toArray() // will return an array with results

// using bulk operations

const result = await org.objects.bulk()
    .add(org.objects.c_my_object.inserOne({}), {
        name: 'InserOne',
        halt: true,
        wrap: true,
        output: true
    })
    .add(org.objects.c_my_object.find({c_name: 'test'}), {
         name: 'Results',
         halt: true,
         wrap: true,
         output: true
     })
     .toArray()


// In case you want to use a different credentials/environment

const driver = new Driver(new Client({environment, credentials}))
const obj = new CortexObject('c_my_object', driver)

const result = await obj.find({c_name: 'test'})

````
