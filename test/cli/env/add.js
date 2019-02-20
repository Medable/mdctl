const { assert } = require('chai'),
      path = require('path'),
      fs = require('fs'),
      rimraf = require('rimraf'),
      { parseString } = require('../../../src/lib/utils/values'),
      Environment = require('../../../src/lib/env')

describe('CLI - Env - Adding Resources', () => {


  it('add a script resource', async() => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          params = { format: 'json', dir: tempDir },
          options = Object.assign(params, {
            object: 'script',
            type: 'route',
            name: 'c_my_custom_route'
          }),
          manifest = {}
    await Environment.add(options)
    assert(fs.existsSync(`${tempDir}/env/scripts/c_my_custom_route.json`), 'file expected to be present')
    assert(fs.existsSync(`${tempDir}/env/scripts/js/c_my_custom_route.js`), 'file expected to be present')
    assert(fs.existsSync(`${tempDir}/manifest.json`), 'file expected to be present')
    manifest.data = parseString(fs.readFileSync(`${tempDir}/manifest.json`))
    assert(manifest.data.scripts.includes.length === 1, 'wrong expected number of scripts present in manifest')
    rimraf.sync(tempDir)
  })

  it('add a template resource', async() => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          params = { format: 'json', dir: tempDir },
          options = Object.assign(params, {
            object: 'template',
            type: 'email',
            name: 'c_my_custom_template'
          }),
          manifest = {}
    await Environment.add(options)
    assert(fs.existsSync(`${tempDir}/env/templates/c_my_custom_template.json`), 'file expected to be present')
    assert(fs.existsSync(`${tempDir}/env/templates/tpl/c_my_custom_template.html.html`), 'file expected to be present')
    assert(fs.existsSync(`${tempDir}/env/templates/tpl/c_my_custom_template.plain.txt`), 'file expected to be present')
    assert(fs.existsSync(`${tempDir}/env/templates/tpl/c_my_custom_template.subject.txt`), 'file expected to be present')
    assert(fs.existsSync(`${tempDir}/manifest.json`), 'file expected to be present')
    manifest.data = parseString(fs.readFileSync(`${tempDir}/manifest.json`))
    assert(manifest.data.templates.includes.length === 1, 'wrong expected number of templates present in manifest')
    rimraf.sync(tempDir)
  })

})
