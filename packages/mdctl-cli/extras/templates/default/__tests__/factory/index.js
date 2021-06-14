import glob from 'glob'

import FactoryBuilder from './base/factory-builder'
import Api from '../api'

const client = Api(__API__)
const factoryBuilder = new FactoryBuilder(client)

glob.sync(`${__dirname}/models/*.js`)
  .forEach((builderFile) => {
    factoryBuilder.register(require(builderFile).default)
  })

export default factoryBuilder