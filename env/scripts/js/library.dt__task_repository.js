const { c_tasks } = org.objects

class TaskRepository {

  static findIdsByKeys(taskKeys) {
    return c_tasks
      .find({ c_key: { $in: taskKeys } })
      .paths('_id')
      .map(task => task._id.toString())
  }

  static findSurveysByStudyId(studyId) {
    return c_tasks
      .find({
        'c_study._id': studyId,
        c_type: 'survey'
      })
      .toArray()
  }

}

module.exports = TaskRepository