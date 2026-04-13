import nq from 'c_nucleus_query'
import cache from 'cache'

let [ _id, ...rest ] = cache.get('retroQuery')

let res = { _id } 
try {
    nq.checkQueries(org.objects.c_task_response.find({ _id }).next())
    res.ok = true
} catch(e) {
    res.error = JSON.stringify(e, null, '\t')
}
cache.set('retroQuery', rest)
res.hasMore = rest.length > 0
return res