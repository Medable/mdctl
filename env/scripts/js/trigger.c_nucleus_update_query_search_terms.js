import nucUtils from 'c_nucleus_utils'
import logger from 'logger'
import { isArray } from 'lodash'

const search = nucUtils.updateQuerySearchTerms(script.context)

if (search.length > 0 && isArray(script.context)) {
  script.context.push('c_search', search, { grant: 6 })
}