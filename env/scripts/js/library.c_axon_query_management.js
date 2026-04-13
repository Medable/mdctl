/***********************************************************

 @script     Axon - Query Management

 @brief      Library that handles open query management, ensuring that
             the open query count on public users is always up to date, and
             defining transforms that can be added to existing routes.

 @author     Pete Richards

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { transform, trigger, as, log } from 'decorators'
import logger from 'logger'

// Returns the number of open queries for a given public user.
function getOpenQueryCount(publicUserId) {
  return org.objects.c_queries.count({
    c_subject: publicUserId,
    c_status: 'open'
  })
}

// Sets the number of open queries for a given public user.
function setOpenQueryCount(publicUserId, count) {
  return org.objects.c_public_users
    .updateOne({
      _id: publicUserId
    }, {
      $set: {
        c_open_queries: count
      }
    })
    .execute()
}

/**
 * AxonQueryManagement.
 *
 * Responsibilities:
 *  - recalculate query counts when queries are created, updated, or deleted.
 *  - expose a method that can be used in migrations to update all public user
 *    query counts.
 */
class AxonQueryManagement {

  // Calculates the open query count for a user and saves it.
  @as('c_system_user', { principal: { skipAcl: true, grant: consts.accessLevels.script } })
  static updateOpenQueryCount(publicUserId) {
    return setOpenQueryCount(publicUserId, getOpenQueryCount(publicUserId))
  }

  @log({ tracingError: true })
  @trigger('update.after', {
    object: 'c_query',
    inline: true,
    if: {
      $and: [
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'c_status'
            ]
          }, 0]
        },
        {
          $ne: [
            {
              $pathTo: ['$$ROOT', 'c_subject']
            },
            null
          ]
        },
        {
          $in: [
            '$$ROOT.c_status',
            {
              $array: [
                'closed',
                'cancelled',
                'responded',
                'closed:requery'
              ]
            }
          ]
        }
      ]
    }
  })
  static updatePublicUserAfterQueryUpdate({ old: { c_subject: subject, c_status: oldStatus }, new: { c_status: newStatus } }) {

    if (oldStatus === newStatus) return

    this.updateOpenQueryCount(subject._id)

  }

  @log({ tracingError: true })
  @trigger('create.after', {
    object: 'c_query',
    if: {
      $ne: [
        {
          $pathTo: ['$$ROOT', 'c_subject']
        },
        null
      ]
    }
  })
  static updateQueryCountOnCreation({ new: { c_subject: subject } }) {

    this.updateOpenQueryCount(subject._id)

  }

  static updateAllPublicUserQueryCounts() {
    const cursor = org.objects.c_public_users
      .find()
      .transform('c_axon_update_public_user_open_queries')

    return org.objects.bulk()
      .add(cursor)
      .async({
        onComplete: `
          import logger from 'logger'
          logger.info('Finished updating public user query counts.')
        `
      })
      .next()
  }

}

/**
 * Transform that updates the query count for every public user returned.
 */
@transform({ name: 'c_axon_update_public_user_open_queries' })
class UpdatePublicUserOpenQueries {

  each(publicUser) {
    publicUser.c_open_queries = getOpenQueryCount(publicUser._id)
    setOpenQueryCount(publicUser._id, publicUser.c_open_queries)
    return publicUser
  }

}

@transform({ name: 'c_axon_calc_task_response_open_queries' })
class CalculateTaskResponseOpenQueries {

  each(taskResponse) {
    taskResponse.c_open_queries = script.as('c_system_user', { principal: { skipAcl: true, grant: consts.accessLevels.read }, acl: { safe: false }, modules: { safe: false } }, () => {
      return org.objects.c_queries.count({
        c_task_response: taskResponse._id,
        c_status: 'open'
      })
    })

    return taskResponse
  }

}

module.exports = AxonQueryManagement