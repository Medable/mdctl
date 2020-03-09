/* eslint-disable no-param-reassign */

const Util = require('../../util'),
      ROUTE = Object.freeze({
        params: {
          path: [],
          body: [],
          query: [],
          header: [],
          response: []
        }
      }),
      PARAMS = Object.freeze({
        arg: [],
        response: []
      }),
      PARAM_TAG_PROPERTIES = Object.freeze({
        canHaveType: true,
        canHaveName: true,
        mustHaveValue: true,
      })

module.exports = {
  defineTags: function defineTags(dictionary) {
    dictionary.defineTag('route', {
      canHaveName: true,
      mustHaveValue: true,
      onTagged(doclet, tag) {
        if (!doclet.route) {
          doclet.route = Util.clone(ROUTE) // eslint-disable-line no-param-reassign
        }
        doclet.route.path = tag.value.name.toLowerCase()
        doclet.route.method = (tag.value.description || 'get').toLowerCase()
      }
    })
    dictionary.defineTag('param-response', {
      ...PARAM_TAG_PROPERTIES,
      onTagged(doclet, tag) {
        if (!doclet.paramsFormatted) {
          doclet.paramsFormatted = Util.clone(PARAMS)
        }
        doclet.paramsFormatted.response.push(tag.value)
      }
    })
    dictionary.defineTag('param-route-path', {
      ...PARAM_TAG_PROPERTIES,
      onTagged(doclet, tag) {
        if (!doclet.route) {
          doclet.route = Util.clone(ROUTE) // eslint-disable-line no-param-reassign
        }
        doclet.route.params.path.push(tag.value)
      }
    })
    dictionary.defineTag('param-route-body', {
      ...PARAM_TAG_PROPERTIES,
      onTagged(doclet, tag) {
        if (!doclet.route) {
          doclet.route = Util.clone(ROUTE) // eslint-disable-line no-param-reassign
        }
        doclet.route.params.body.push(tag.value)
      }
    })
    dictionary.defineTag('param-route-query', {
      ...PARAM_TAG_PROPERTIES,
      onTagged(doclet, tag) {
        if (!doclet.route) {
          doclet.route = Util.clone(ROUTE) // eslint-disable-line no-param-reassign
        }
        doclet.route.params.query.push(tag.value)
      }
    })
    dictionary.defineTag('param-route-header', {
      ...PARAM_TAG_PROPERTIES,
      onTagged(doclet, tag) {
        if (!doclet.route) {
          doclet.route = Util.clone(ROUTE) // eslint-disable-line no-param-reassign
        }
        doclet.route.params.header.push(tag.value)
      }
    })
    dictionary.defineTag('param-route-response', {
      ...PARAM_TAG_PROPERTIES,
      onTagged(doclet, tag) {
        if (!doclet.route) {
          doclet.route = Util.clone(ROUTE) // eslint-disable-line no-param-reassign
        }
        doclet.route.params.response.push(tag.value)
      }
    })
  },
  handlers: {
    parseComplete(event) {
      event.doclets.forEach((doclet) => {
        if (doclet.params) {
          if (!doclet.paramsFormatted) {
            doclet.paramsFormatted = Util.clone(PARAMS)
          }
          doclet.paramsFormatted.arg.push(...doclet.params)
        }

        if (doclet.paramsFormatted) {
          doclet.paramsFormatted.arg = Util.translateParams(doclet.paramsFormatted.arg)
          doclet.paramsFormatted.response = Util.translateParams(doclet.paramsFormatted.response)
        }

        if (doclet.route) {
          doclet.route.params.path = Util.translateParams(doclet.route.params.path)
          doclet.route.params.body = Util.translateParams(doclet.route.params.body)
          doclet.route.params.query = Util.translateParams(doclet.route.params.query)
          doclet.route.params.header = Util.translateParams(doclet.route.params.header)
          doclet.route.params.response = Util.translateParams(doclet.route.params.response)
        }
      })
    }
  }
}
