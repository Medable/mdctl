function defineTags(dictionary){
  dictionary.defineTag('script', {
    mustHaveValue: true,
    onTagged: (doclet, tag) => doclet.script = tag.text,
  })
}

module.exports = {
  defineTags,
}