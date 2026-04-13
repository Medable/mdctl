import { paths } from 'util'

// Modify history objects to reproduce history behavior prior to CTXAPI-655.
// this is used as a temporary fix to legacy history endpoints.
function patchHistoryOperations(object) {

  const operations = paths.to(object, 'ops')

  if (!operations || !Array.isArray(operations)) { return }

  operations.forEach(operation => {
    if (operation.type !== 1) {
      return // only patch set operations
    }
    if (typeof operation.value === 'undefined') {
      operation.value = paths.to(object, `document.${operation.path}`)
    }
  })
}

module.exports = {
  patchHistoryOperations
}