import req from 'request'
import res from 'response'
import { paths } from 'util'
import { patchHistoryOperations } from 'c_axon_combatibility_library'

return script.as(require('c_nucleus_utils').SystemUser.name, { acl: { safe: false } }, () => {
  const { c_public_users, history, accounts } = org.objects,
        limit = req.query.limit || 10,
        skip = req.query.skip || 0,
        subjectId = req.params.subjectId,
        subject = c_public_users.find({ _id: subjectId })
          .skipAcl()
          .grant(4)
          .next(),
        historyObj = history.find({ 'context._id': subject._id, 'context.sequence': { '$gt': 0 } })
          .skipAcl()
          .grant(8)
          .limit(limit)
          .skip(skip)
          .sort({ _id: -1 })
          .toList(), // all connected histroy objects
        accountIds = historyObj.data.map(v => { return v.document.updater ? v.document.updater._id.toString() : '' })
          .filter((v, i, a) => v !== '' && a.indexOf(v) === i), // unique updater account ids
        updaterInfo = accounts.find({ _id: { '$in': accountIds } })
          .skipAcl()
          .grant(4)
          .paths('c_public_identifier')
          .toArray(), // updater account info
        serviceAccounts = org.objects.org.find()
          .next().serviceAccounts

  let returnValues = [].concat(...historyObj.data.map(item => {
    patchHistoryOperations(item)

    // let findObj = allObjects.find(o => {return o._id.equals(item.context._id)}) // get the object this histroy item referrs to
    let findAcc = updaterInfo.find(o => { return item.document.updater && o._id.equals(item.document.updater._id) }) // get the updater info for this histroy item

    if (findAcc) {
      item.document.updater.c_public_identifier = findAcc.c_public_identifier // populate the updater info
      delete item.document.updater.path
    } else if (item.document.updater) {
      // check is the updater a service account
      let sa = serviceAccounts.find(v => v._id.equals(item.document.updater._id))
      if (sa) {
        item.document.updater.c_public_identifier = sa.label // populate the updater info
        delete item.document.updater.path
      }
    }

    item.document.objectName = item.document.object.replace('c_', '')
      .replace('_', ' ')
    return item.ops.map(op => {

      let oldValue = null

      if (item.context.sequence && item.context.sequence > 0) { // Assuming context.sequence is the update order
        oldValue = op.value == null ? null : String(op.value)
      }

      let newValue = item.document[op.path] == null ? null : String(item.document[op.path])

      let opRet = {
        // ...Object.assign( item.document, findObj),
        ...item.document,
        path: op.path.replace('c_', '')
          .replace('_', ' '),
        oldValue,
        newValue
      }

      return opRet
    })
  }))

  returnValues = returnValues.filter(v => v.oldValue || v.newValue) // There are odd items in the histroy list that this removes

  let retObj = {
    data: returnValues,
    object: 'list',
    hasMore: historyObj.hasMore
  }

  return retObj
})