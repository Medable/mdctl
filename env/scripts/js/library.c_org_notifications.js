/***********************************************************

 @script  Axon - Org Configuration Notifications - Study Designer

 @brief  Retrieve Org Configuration Notifications
 @author  Anas

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { route } from 'decorators'

class OrgConfigurationNotifications {

  /***********************************************************

  @brief  Route to retrieve Org Configuration Notifications

  @route  routes/org_configuration_notifications/

  @response  result with Org Configuration Notifications
  {
    "notifications": [
      {
        "_id": "62163b63b8582f010061440c",
        "label": "Axon Invite (Access Code)",
        "name": "c_axon_invite-access_code"
      }
    ]
  }

  (c)2019 Medable, Inc.  All Rights Reserved.

  ***********************************************************/
  /**
   * @openapi
   * /org_configuration_notifications:
   *  get:
   *    description: 'Get org notifications'
   *
   *    responses:
   *      '200':
   *        description: the notifications belonging to the org
   */
  @route({
    weight: 1,
    method: 'GET',
    name: 'c_get_org_notifications',
    path: 'org_configuration_notifications',
    acl: [
      'role.c_study_designer',
      'role.c_study_viewer',
      'role.administrator'
    ]
  })
  getOrgConfigurationNotifications({ req }) {
    const orgNotifications = org.objects.org.find()
      .paths('configuration.notifications')
      .skipAcl(true)
      .grant(6)
    return {
      notifications: orgNotifications.map(({ configuration: { notifications } }) => {

        return notifications.reduce((acc, { label, name, _id }) => {
          acc.push({ _id, label, name })
          return acc
        }, [])

      })
    }

  }

}

module.exports = OrgConfigurationNotifications