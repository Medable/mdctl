const jsyaml = require('js-yaml'),
      Stream = require('../index'),
      ConsoleAdapter = require('./console_adapter').adapter,
      Section = require('./sections'),
      KEYS = ['env', 'objects', 'scripts', 'templates', 'views'],

      layout = Stream.output.MEMORY

class MemoryAdapter extends ConsoleAdapter {

  processFiles() {
    return this.source
  }

}

module.exports = {
  adapter: MemoryAdapter,
  layout
}
