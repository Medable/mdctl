const { c_steps } = org.objects,
      { accessLevels } = consts

class StepRepository {

  static findIdsByKeys(stepKeys) {
    return c_steps
      .find({ c_key: { $in: stepKeys } })
      .paths('_id')
      .map(step => step._id.toString())
  }

  static findByIds(stepIds) {
    return c_steps
      .find({ _id: { $in: stepIds } })
      .skipAcl()
      .grant(accessLevels.read)
      .toArray()
  }

  static findByKeys(stepKeys) {
    return c_steps
      .find({ c_key: { $in: stepKeys } })
      .skipAcl()
      .grant(accessLevels.read)
      .toArray()
  }

  static findByTaskIds(taskIds) {
    return c_steps
      .find({ 'c_task._id': { $in: taskIds } })
      .toArray()
  }

}

module.exports = StepRepository