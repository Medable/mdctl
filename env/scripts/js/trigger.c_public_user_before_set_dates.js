import logger from 'logger'
import faults from 'c_fault_lib'

function isSetDatesModified(oldSetDates, newSetDates) {
  let isModified = false
  for (const existingInstance of oldSetDates) {
    const equivalentNewInstance = newSetDates.find(({ _id }) => _id.equals(existingInstance._id))
    if (equivalentNewInstance) {
      isModified = JSON.stringify(existingInstance) !== JSON.stringify(equivalentNewInstance)
      if (isModified) break
    } else {
      isModified = true
    }
  }
  return isModified
}

const { arguments: { new: newInstance, old: oldInstance } } = script

const { c_set_dates: newSetDates } = newInstance

const { c_set_dates: oldSetDates } = oldInstance

if (!newSetDates) return

const isAddingSetDates = oldSetDates.length < newSetDates.length

const isRemovingSetDates = oldSetDates.length > newSetDates.length

if (isAddingSetDates || isRemovingSetDates) return

// when set dates are equal in length
if (isSetDatesModified(newSetDates, oldSetDates)) {
  const request = require('request')
  const isAuditMsgPresent = request.body && request.body.audit && request.body.audit.message
  if (!isAuditMsgPresent) {
    faults.throw('axon.invalidArgument.generalReasonForChangeRequired')
  }
}