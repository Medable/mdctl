import logger from 'logger'
import { QueryStatus } from 'c_nucleus_query'

const Query = org.objects.c_query,
      _id = script.context.c_query._id,
      $set = { c_status: QueryStatus.Responded }

script.as(require('c_nucleus_utils').SystemUser.name, {}, () => {
  Query.updateOne({ _id }, { $set }).lean(false).execute()
})