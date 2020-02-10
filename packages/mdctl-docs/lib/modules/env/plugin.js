function defineTags(dictionary) {
  dictionary.defineTag('script', {
    mustHaveValue: true,
    onTagged(doclet, tag) {
      doclet.script = tag.text // eslint-disable-line no-param-reassign
    },
  })
}

module.exports = {
  defineTags,
}
