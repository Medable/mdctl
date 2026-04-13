/***********************************************************

 @script     Axon - Send Televisit Event Reminders

 @brief      Sends televisit event reminders.  Uses a transform and returns a
             headless cursor to ensure all records are executed.

 @author     Pete Richards

 @schedule   every minute

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

function getCursor() {
  return org.objects.c_event
    .find({
      'c_reminders.c_date': {
        $lte: new Date()
      }
    })
    .include('c_public_user.c_account')
    .skipAcl()
    .grant(consts.accessLevels.read)
}

const hasResults = getCursor()
  .limit(1)
  .hasNext()

if (!hasResults) {
  return
}

const transformCursor = getCursor()
  .transform('c_axon_televisit_reminder_transform')

return org.objects.bulk()
  .add(transformCursor)
  .async({
    onComplete: `
      import logger from 'logger'
      const { err, memo } = script.arguments
      if (err) {
        logger.error('Error sending reminders:', err)
      } else if (memo && (memo.sent || memo.errors)) {
        logger.info(\`Televisit Notifications: Sent \${memo.sent} reminders in \${memo.batches} batches with \${memo.errors} errors.\`)
      }
    `
  })
  .next()