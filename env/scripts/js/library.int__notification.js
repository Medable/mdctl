const notifications = require('notifications');
const config = require('config');

class IntNotification {

  static sendQueueNotification(queueId) {

    const { notification_recipients: recipients } = config.get('int__config');

    const isArray = Array.isArray(recipients);

    if (!isArray || recipients.length === 0) return;

    const template = 'int__queue_failed';

    const queue = org.objects.int__queue.readOne(
      { _id: queueId },
    )
      .expand('int__vendor', 'int__pipeline')
      .paths('_id', 'int__sequence', 'updated', 'int__vendor.int__identifier', 'int__pipeline.int__identifier')
      .throwNotFound(false)
      .skipAcl()
      .grant('read')
      .execute();

    const { _id: queue_id, updated: time } = queue;

    const user = org.objects.c_public_user.readOne(
      { _id: queue.int__sequence },
    )
      .expand('c_site')
      .paths('_id', 'c_number', 'c_site.c_number')
      .throwNotFound(false)
      .skipAcl()
      .grant('read')
      .execute();

    // eslint-disable-next-line array-callback-return
    return recipients.map((recipient) => {
      this.triggerEmailNotification(
        template,
        {
          queue_id,
          time,
          connector_name: queue.int__vendor.int__identifier,
          pipeline_identifier: queue.int__pipeline.int__identifier,
          subject_number: user.c_number,
          user_id: user._id,
          site_number: user.c_site.c_number,
        },
        recipient,
      );
    });

  }

  static triggerEmailNotification(template, payload, recipient) {
    return notifications.send(
      template,
      {
        ...payload,
      },
      {
        recipient,
      },
    );

  }

}

module.exports = IntNotification;