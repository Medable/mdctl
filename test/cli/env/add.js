const { assert } = require('chai'),
      path = require('path'),
      fs = require('fs'),
      rimraf = require('rimraf'),
      EnvTask = require('../../../src/cli/tasks/env')

describe('CLI - Env - Adding Resources', () => {


  it('add a script resource', (done) => {
    const task = new EnvTask(),
          tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          addParams = ['add', 'script', 'route', 'c_my_custom_route'],
          cli = {
            args: index => addParams[parseInt(index, 10) - 1],
            getArguments: () => ({ layout: 'tree', format: 'json', dir: tempDir })
          }
    task.run(cli).then(() => {
      assert(fs.existsSync(`${tempDir}/env/scripts/c_my_custom_route.json`), 'file expected to be present')
      assert(fs.existsSync(`${tempDir}/env/scripts/js/c_my_custom_route.js`), 'file expected to be present')
      rimraf.sync(tempDir)
      done()
    }).catch(done)
  })

  it('add a template resource', (done) => {
    const task = new EnvTask(),
          tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          addParams = ['add', 'template', 'email', 'c_my_custom_template'],
          cli = {
            args: index => addParams[parseInt(index, 10) - 1],
            getArguments: () => ({ layout: 'tree', format: 'json', dir: tempDir })
          }
    task.run(cli).then(() => {
      assert(fs.existsSync(`${tempDir}/env/templates/c_my_custom_template.json`), 'file expected to be present')
      assert(fs.existsSync(`${tempDir}/env/templates/tpl/c_my_custom_template.html.html`), 'file expected to be present')
      assert(fs.existsSync(`${tempDir}/env/templates/tpl/c_my_custom_template.plain.txt`), 'file expected to be present')
      assert(fs.existsSync(`${tempDir}/env/templates/tpl/c_my_custom_template.subject.txt`), 'file expected to be present')
      rimraf.sync(tempDir)
      done()
    }).catch(done)
  })

})
