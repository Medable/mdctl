import logger from 'logger'
import _ from 'underscore'
import c_nuc_utils from 'c_nucleus_utils'
import request from 'request'
import cache from 'cache'

c_nuc_utils.setPublicuserSearchTerms(script.arguments.old._id)
c_nuc_utils.setPublicuserNameEmail(script.arguments.old._id)