/***********************************************************

@script     PI Oversight Signoff - After Create Trigger

@brief      Automatically updates participant's last PI oversight signoff reference

@version    1.0.0

***********************************************************/

/*
 * Trigger: Update participant's last PI oversight signoff reference
 * Fires after a new c_pi_oversight_signoff is created
 */

const { c_public_user, _id } = script.context
const participantId = c_public_user && c_public_user._id ? c_public_user._id : c_public_user

if (participantId && _id) {
  // Update the participant's last oversight reference
  // This ensures the c_public_user always points to the most recent signoff
  org.objects.c_public_users.updateOne(
    { _id: participantId },
    { $set: { c_last_pi_oversight_signoff: _id } }
  )
    .skipAcl()
    .grant(consts.accessLevels.update)
    .execute()
}