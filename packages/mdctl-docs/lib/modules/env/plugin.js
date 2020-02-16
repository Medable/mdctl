const Util = require('../../util')
const ROUTE = Object.freeze({
  params: {
    path: [],
    body: [],
    query: [],
    header: [],
    response: []
  }
})

function defineTags(dictionary) {
  dictionary.defineTag('route-param-path', {
    canHaveType: true,
    canHaveName: true,
    mustHaveValue: true,
    onTagged(doclet, tag) {
      if(!doclet.route){
        doclet.route = Util.clone(ROUTE)
      }
      doclet.route.params.path.push(tag.value)
    }
  })
  dictionary.defineTag('route-param-body', {
    canHaveType: true,
    canHaveName: true,
    mustHaveValue: true,
    onTagged(doclet, tag) {
      if(!doclet.route){
        doclet.route = Util.clone(ROUTE)
      }
      doclet.route.params.body.push(tag.value)
    }
  })
  dictionary.defineTag('route-param-query', {
    canHaveType: true,
    canHaveName: true,
    mustHaveValue: true,
    onTagged(doclet, tag) {
      if(!doclet.route){
        doclet.route = Util.clone(ROUTE)
      }
      doclet.route.params.query.push(tag.value)
    }
  })
  dictionary.defineTag('route-param-header', {
    canHaveType: true,
    canHaveName: true,
    mustHaveValue: true,
    onTagged(doclet, tag) {
      if(!doclet.route){
        doclet.route = Util.clone(ROUTE)
      }
      doclet.route.params.header.push(tag.value)
    }
  })
  dictionary.defineTag('route-param-response', {
    canHaveType: true,
    canHaveName: true,
    mustHaveValue: true,
    onTagged(doclet, tag) {
      if(!doclet.route){
        doclet.route = Util.clone(ROUTE)
      }
      doclet.route.params.response.push(tag.value)
    }
  })
}

module.exports = {
  defineTags,
}