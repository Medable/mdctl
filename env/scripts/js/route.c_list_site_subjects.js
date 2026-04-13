/***********************************************************

 @script     Axon - List subjects

 @brief      List the subject for a particular site

 @route      /routes/site_subjects/:c_site

 @parameter URL
  c_site: The site ID from which to list subjects
 @parameter Query
  c_search: the site of the subject(either this or c_study is required)
  The following standard cortex parameters work as expected:
  - limit
  - skip
  - expand
  - sort

 @example
 GET https://{{domain}}/{{org}}/{{version}}/routes/site_subjects/5bf57248b7dadb0100ea51f9?c_search=fiachra&limit=2

 @version    4.9.0         (Medable.MIL)

  (c)2016-2017 Medable, Inc.  All Rights Reserved.
  Unauthorized use, modification, or reproduction is prohibited.
  This is a component of Axon, Medable's SmartStudy(TM) system.

 ***********************************************************/

/**
 * @openapi
 * /site_subjects/{site}:
 *  get:
 *    description: 'List the subject for a particular site.'
 *    parameters:
 *      - name: site
 *        in: path
 *        required: false
 *        description: The site ID from which to list subjects
 *      - name: c_search
 *        in: query
 *        required: false
 *        description: The site of the subject
 *
 *    responses:
 *      '200':
 *        description: returns a list of c_group_list_entry objects, in the standard cortex response wrapper.
 *        content:
 *          application/json:
 *            schema:
 *              $ref: '#/components/schemas/c_group'
 */

import logger from 'logger'
import req from 'request'
import NucleusUtils from 'c_nucleus_utils'

const { accounts, c_sites } = org.objects
const c_site = req.params.site
const unblindedRoles = ['Administrator', 'Site User', 'Site Investigator', 'Axon Site User', 'Axon Site Investigator', 'Axon Site Monitor', 'Axon Site Auditor', 'Site Monitor']
const roles = NucleusUtils.getUserRolesSimple(script.principal._id, c_site)
  .map(v => v.toString())
const unblindedRoleIds = unblindedRoles.map(v => consts.roles[v].toString())
const unblinded = unblindedRoleIds.some(r => roles.indexOf(r) >= 0)
const sort = req.query.sort || { c_number: -1 }
const enablePagination = req.query.enablePagination === 'true'

let where

if (req.query.where) {
  where = { ...JSON.parse(req.query.where) }
}

if (req.query.c_search) {
  if (where) {
    where.c_search = { $regex: `/^${RegExp.escape(req.query.c_search.toLowerCase())}/i` }
  } else {
    where = {
      c_search: { $regex: `/^${RegExp.escape(req.query.c_search.toLowerCase())}/i` }
    }
  }

}

let total

if (enablePagination) {
  total = org.objects.c_public_user.find({ ...(where || {}), c_site })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .count()
}

// return where
// prefix through the site to ensure that the current user has the right permissions
if (!NucleusUtils.isNewSiteUser(script.principal.roles)) {
  const data = c_sites.find(where)
    .pathPrefix(`${c_site}/c_subjects`)
    .include(req.query.include)
    .expand(req.query.expand)
    .sort(sort)
    .limit(req.query.limit)
    .skip(req.query.skip)
    .transform({ memo: { unblinded }, script: 'c_axon_subject_transform' })

  return enablePagination ? { data: data.toArray(), total } : data
} else {
  const data = accounts.find(where)
    .pathPrefix(`${script.principal._id}/c_sites/${c_site}/c_subjects`)
    .include(req.query.include)
    .expand(req.query.expand)
    .sort(sort)
    .limit(req.query.limit)
    .skip(req.query.skip)
    .transform({ memo: { unblinded }, script: 'c_axon_subject_transform' })

  return enablePagination ? { data: data.toArray(), total } : data
}