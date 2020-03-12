function defineTags(dictionary){

  /**
   * Gitbook
   */
  // Tab
  dictionary.defineTag('tab', {
    onTagged: (doclet, tag) => {
      if(!doclet.tabs){ doclet.tabs = [] }
      doclet.tabs.push({
        title: tag.value.name,
        body: tag.value.description
      })
    },
    canHaveName: true,
    mustHaveValue: true
  })

  /**
   * Routes
   */
  // Route
  dictionary.defineTag('route', {
    onTagged: (doclet, tag) => doclet.route = {
      method: (tag.value.type.names[0] || '').replace(/ /g, '_').toLowerCase(),
      path: (tag.value.description || '').replace(/ /g, '_').toLowerCase()
    },
    mustHaveValue: true,
    canHaveType: true
  })
}

module.exports = {
  defineTags,
}