const notifications = require('notifications')

class NotificationRepository {

  static sendExecutionStatus(params) {
    notifications.send('dt__execution_status', {
      completed: params.completed,
      details: params.details ? JSON.stringify(params.details) : '',
      id: params.id,
      transferName: params.transferName,
      studyName: params.studyName
    }, {
      locale: 'en_US',
      recipient: params.recipient
    })
  }

}

module.exports = NotificationRepository