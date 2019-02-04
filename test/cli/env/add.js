
const { assert } = require('chai'),
      envTask = require('../../../src/cli/tasks/env')

describe('CLI - Env - Adding Resources', () => {


  it('add a script resource', async() => {
    const task = new envTask(),
          addParams = ['add', 'script', 'route', 'c_my_custom_route'],
          cli = {
            args: index => addParams[parseInt(index, 10) - 1],
            getArguments: optionKeys => ({ layout: 'tree', format: 'json' })
          }
    task.run(cli).then(() => {
      console.log('aca')
    })
  })

})
