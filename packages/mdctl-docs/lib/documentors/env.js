const path = require('path'),
      fs = require('fs'),
      { spawn } = require('child_process'),
      util = require('../util'),
      { loadPartials } = require('../handlebars'),
      TEMPLATES = loadPartials(),
      notTopLevelResource = ['dependencies', 'object', 'objects']

function writeJSDocs(source, destination){

  return new Promise((resolve, reject) => {
    const jsdoc = path.join(__dirname, '../../node_modules/.bin/jsdoc'),
          scriptDirectory = path.join(source, 'env'),
          outputDirectory = path.join(destination, 'jsdoc'),
          params = [
            scriptDirectory,
            '--recurse',
            '--destination', outputDirectory
          ]

    try {

      const proc = spawn(jsdoc, params, { encoding: 'utf8' })

      proc.stdout.on('data', (data) => console.log(data.toString('utf8')))
      proc.stderr.on('data', (data) => console.log(data.toString('utf8')))
      proc.on('close', () => resolve())

    } catch (err) {
      reject(err)
    }
  })

}

function writeDocs(manifest, home, destination){

  for(const [resourceName, resourceManifest] of Object.entries(manifest).filter(([resourceName]) => !notTopLevelResource.includes(resourceName))){
    if(fs.existsSync(path.join(home, 'env', resourceName))){
      writeResource(resourceName, resourceManifest, home, destination)
    }
  }

  if(fs.existsSync(path.join(home, 'env/objects'))){
    writeObjects(manifest.objects, home, destination)
  }

  writePackageSummary(manifest, destination)

}

function writeResource(resourceName, resourceManifest, home, destination){

  const includeAll = resourceManifest.includes.length === 1 && resourceManifest.includes[0] === '*',
        objects = includeAll
          ? util.listFiles(path.join(home, 'env', resourceName))
            .map(filePath => util.readJson(filePath))
          : resourceManifest.includes
            .map(name => util.readJson(path.join(home, 'env', resourceName, `${name}.json`))),
        content = TEMPLATES.MD_OBJECTS({
          name: resourceName,
          objects
        })

  util.writeFile({
    content,
    name: `${resourceName}.md`,
    path: '.'
  }, destination)

}

function writeObjects(objectManifests, home, destination){

  for(const { name } of objectManifests){

    const object = util.readJson(path.join(home, 'env/objects', `${name}.json`)),
          content = TEMPLATES.MD_OBJECT({ object })

    util.writeFile({
      content,
      name: `${name}.md`,
      path: 'objects'
    }, destination)
  }

}

function writePackageSummary(manifest, destination){

  const links = Object.keys(manifest)
          .filter(key => !notTopLevelResource.includes(key))
          .map(key => ({
            name: key,
            uri: `./${key}.md`
          })),
        sections = [
          manifest.objects && {
            label: 'Objects',
            links: Object.values(manifest.objects).map(({ name }) => ({
              name,
              uri: `./objects/${name}.md`
            }))
          },
          {
            label: 'Scripts',
            links: [
              {
                name: 'JSDocs',
                uri: './jsdoc/'
              }
            ]
          }
        ].filter(section => section),
        content = TEMPLATES.GITBOOK_SUMMARY({
          links,
          sections,
          label: 'Package Summary'
        })

  util.writeFile({
    content,
    name: 'SUMMARY.md',
    path: '.'
  }, destination)
}

async function generate(source, destination){

  const home = path.resolve(process.cwd(), source),
        manifest = util.readJson(path.join(home, 'manifest.json'))

  writeDocs(manifest, home, destination)

  await writeJSDocs(source, destination)

}

module.exports = {
  generate,
}
