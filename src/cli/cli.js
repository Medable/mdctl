#!/usr/bin/env node

const MdCtlCli = require('./mdctl'),

      cli = new MdCtlCli()

cli.run()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.log(err)
  })
