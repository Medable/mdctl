const { env } = require('./documentors')

async function generate(options = {}) {

  const { source, destination } = Object.assign({
    destination: 'docs',
    source: '.'
  }, options)

  await env.generate(source, destination)

  return true

}

module.exports = {
  generate
}
