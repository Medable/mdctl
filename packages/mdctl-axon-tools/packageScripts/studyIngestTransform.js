const { Transform } = require('runtime.transform')

module.exports = class extends Transform {

  each(resource) {

    switch (resource.object) {

      case 'c_study':
        this.studyAdjustments(resource)
        break

        // add other modifications

      default:
        console.log('No ingest')
    }

    return resource
  }

  /**
   * Add modifications to the study object
   * @param {*} resource
   */
  studyAdjustments(resource) {

    // eslint-disable-next-line no-prototype-builtins
    if (!resource.hasOwnProperty('c_no_pii')) {
      // eslint-disable-next-line no-param-reassign
      resource.c_no_pii = false
    }

  }

}
