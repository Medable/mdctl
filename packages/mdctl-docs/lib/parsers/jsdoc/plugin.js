/* eslint-disable no-param-reassign */

const util = require('../../util'),
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
          doclet.route = util.clone(ROUTE)
        }
        doclet.route.path = tag.value.name.toLowerCase()
        doclet.route.method = (tag.value.description || 'get').toLowerCase()
      }
    })
    dictionary.defineTag('param-response', {
      ...PARAM_TAG_PROPERTIES,
      onTagged(doclet, tag) {
        if (!doclet.paramsFormatted) {
          doclet.paramsFormatted = util.clone(PARAMS)
        }
        doclet.paramsFormatted.response.push(tag.value)
      }
    })
    dictionary.defineTag('param-route-path', {
      ...PARAM_TAG_PROPERTIES,
      onTagged(doclet, tag) {
        if (!doclet.route) {
          doclet.route = util.clone(ROUTE)
        }
        doclet.route.params.path.push(tag.value)
      }
    })
    dictionary.defineTag('param-route-body', {
      ...PARAM_TAG_PROPERTIES,
      onTagged(doclet, tag) {
        if (!doclet.route) {
          doclet.route = util.clone(ROUTE)
        }
        doclet.route.params.body.push(tag.value)
      }
    })
    dictionary.defineTag('param-route-query', {
      ...PARAM_TAG_PROPERTIES,
      onTagged(doclet, tag) {
        if (!doclet.route) {
          doclet.route = util.clone(ROUTE)
        }
        doclet.route.params.query.push(tag.value)
      }
    })
    dictionary.defineTag('param-route-header', {
      ...PARAM_TAG_PROPERTIES,
      onTagged(doclet, tag) {
        if (!doclet.route) {
          doclet.route = util.clone(ROUTE)
        }
        doclet.route.params.header.push(tag.value)
      }
    })
    dictionary.defineTag('param-route-response', {
      ...PARAM_TAG_PROPERTIES,
      onTagged(doclet, tag) {
        if (!doclet.route) {
          doclet.route = util.clone(ROUTE)
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
            doclet.paramsFormatted = util.clone(PARAMS)
          }
          doclet.paramsFormatted.arg.push(...doclet.params)
        }

        if (doclet.paramsFormatted) {
          doclet.paramsFormatted.arg = util.translateParams(doclet.paramsFormatted.arg)
          doclet.paramsFormatted.response = util.translateParams(doclet.paramsFormatted.response)
        }

        if (doclet.route) {
          doclet.route.params.path = util.translateParams(doclet.route.params.path)
          doclet.route.params.body = util.translateParams(doclet.route.params.body)
          doclet.route.params.query = util.translateParams(doclet.route.params.query)
          doclet.route.params.header = util.translateParams(doclet.route.params.header)
          doclet.route.params.response = util.translateParams(doclet.route.params.response)
        }
      })
    }
  }
}
