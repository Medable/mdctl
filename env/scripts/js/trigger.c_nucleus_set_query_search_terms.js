import nucUtils from 'c_nucleus_utils'
import { isFunction } from 'lodash'

const search = nucUtils.updateQuerySearchTerms(script.context)

if (search.length > 0) {
  if (script.context.update && isFunction(script.context.update)) {
    script.context.update('c_search', search, { grant: 6 })
  }
}