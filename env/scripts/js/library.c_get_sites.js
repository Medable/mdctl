/***********************************************************

 @script     Axon - User Sites

 @brief      Library to fetch user sites

 @author     Naqeeb Naseer

 (c)2022 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { route } from 'decorators'

const Account = org.objects.account

class UserSites {

  /**
   * @openapi
   * /accounts/{accountId}/sites:
   *  get:
   *    description: API that allows admin or support to fetch sites associated with the given user
   *    parameters:
   *      - name: accountId
   *        in: path
   *        description:
   *        required: true
   *        schema:
   *          type: string
   *    responses:
   *      '200':
   *        description: list of sites associated with the given user
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/components/schemas/c_site'
   *
   * @param req
   * @returns c_site
   */
  @route({
    weight: 1,
    method: 'GET',
    name: 'c_get_sites',
    path: 'accounts/:accountId/sites',
    acl: [
      'role.support',
      'role.administrator'
    ]
  })
  getSites({ req }) {
    const { accountId } = req.params
    const limit = req.query.limit || 20
    const skip = req.query.skip || 0
    const sort = req.query.sort || { _id: 1 }

    return script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
      return Account.find()
        .pathPrefix(`${accountId}/c_sites`)
        .limit(limit)
        .skip(skip)
        .sort(sort)
        .toList()
    })

  }

}

module.exports = UserSites