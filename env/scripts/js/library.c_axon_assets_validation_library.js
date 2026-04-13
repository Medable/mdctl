import logger from 'logger'
import _ from 'underscore'

module.exports = {

  checkIfFileNamesAreDup: (dataObject) => {

    // recursively inspect "data" and find file instances
    const findFiles = (data) => {
            let results = [],
                fileKeys = ['creator', 'filename', 'location', 'storageId', 'name', 'state', 'path']
            _(data).forEach((d) => {
              if (_.isObject(d)) {
                let currentObjectKeys = _(d).keys(),
                    difference = _.difference(fileKeys, currentObjectKeys)
                if (difference.length === 0) {
                  results.push(d)
                } else {
                  results = results.concat(findFiles(d))
                }
              }
            })
            return results
          },

          removeExtension = (fileName) => fileName.replace(/\.[^/.]+$/, ''),

          checkIfFileNamesAreDup = (arrOfFilenames) => _.chain(arrOfFilenames).groupBy()
            .filter((arrOfOccurrences) => arrOfOccurrences.length > 1)
            .value().length > 0,

          fileNames = _(findFiles(dataObject)).map((f) => f.filename).map(removeExtension)

    return checkIfFileNamesAreDup(fileNames)
  }
}