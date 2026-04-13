/**
 * @classdesc Common utils
 * @class
 */
class Utils {

  /**
   * This function generates a uuidv4
   * @returns {string}
   */
  static uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0,
            v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

}

module.exports = Utils