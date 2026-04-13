import logger from 'logger'
import faults from 'c_fault_lib'

const { accounts, c_public_users } = org.objects

let createdObj = script.arguments.new
let studyId = createdObj.c_study && createdObj.c_study._id
let publicUser = createdObj.c_public_user && c_public_users.readOne({ _id: createdObj.c_public_user._id })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .execute()
let account = createdObj.c_account && accounts.find({ _id: createdObj.c_account._id })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .expand('c_public_users')
  .next()
let accountId = (account && account._id) || (publicUser && publicUser.c_account && publicUser.c_account._id)
let updateOwner = !!(accountId && !script.principal._id.equals(accountId))

let update = {}

if (updateOwner) {
  update.owner = accountId
}

if (publicUser && account) { // both set, just check they match
  if (!publicUser.c_account || (!publicUser.c_account._id.equals(account._id))) {
    faults.throw('axon.invalidArgument.responsePublicUserRequired')
  }
} else if (account) { // no public user set, make sure you can set one or throw an error
  // you can't create responses for accounts that don't have public users
  if (account.c_public_users.data.length === 0) {
    faults.throw('axon.invalidArgument.responsePublicUserRequired')
  }

  publicUser = account.c_public_users.data.find(v => v.c_study._id.equals(studyId))
  update.c_public_user = publicUser._id
} else if (publicUser) { // no account set. Set one if possible
  if (publicUser.c_account) {
    update.c_account = publicUser.c_account._id
  }
}

if (!createdObj.c_site && publicUser && publicUser.c_site) {
  update.c_site = publicUser.c_site._id
}

// We go this far and didn't throw an error. If there's anything to update, update it
if (Object.keys(update).length) {
  // responses should always be visible to the patient so if created
  // by an account other than the patient, update the response owner
  if (updateOwner) {
    script.as(accountId, { principal: { skipAcl: true, grant: consts.accessLevels.script }, modules: { safe: false } }, () => {
      script.arguments.new.update(update)
    })
  } else {
    script.arguments.new.update(update)
  }
}