import nucUtils from 'c_nucleus_utils'
const { transform } = require('decorators-transform')

@transform
class Transform {

  documents = 0

  each(data, { paths, prefixTpl, include }) {
    const util = require('util')
    // replace the template with the actual values
    const prefix = prefixTpl.replace(/(\$\{.*?\})/g, (match) => {
      const dataPath = match.replace(/[$,{,}]/g, '')
      return util.paths.to(data, dataPath)
    })
    let objectCursor
    if (!nucUtils.isNewSiteUser(script.principal.roles)) {
      objectCursor = org
        .objects
        .c_site
        .find()
    } else {
      objectCursor = org
        .objects
        .accounts
        .find()
    }

    if (paths.length) {
      objectCursor.paths(...paths)
    }

    if (include.length) {
      objectCursor.include(...include)
    }

    const [object] = objectCursor
      .prefix(prefix)
      .passive()
      .toArray()

    if (!object) return

    this.documents++

    return {
      key: 'data',
      data: object
    }
  }

  afterAll({ total }, { cursor }) {

    if (!this.documents) {
      total = 0
    }

    cursor.push({
      key: 'totals',
      data: {
        total,
        hasMore: cursor.hasMore
      }
    })
  }

}

module.exports = Transform