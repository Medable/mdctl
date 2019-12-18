#!/usr/bin/env node

const { Fault } = require('@medable/mdctl-core'),
      MdCtlCli = require('./mdctl'),
      cli = new MdCtlCli()

cli.run()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.log(Fault.from(err, true).toJSON())
    process.exit(1)
  })
