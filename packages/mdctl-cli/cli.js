#!/usr/bin/env node

const MdCtlCli = require('./mdctl'),
      { Fault } = require('@medable/mdctl-core'),
      cli = new MdCtlCli()

cli.run()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.log(Fault.from(err, true).toJSON())
  })
