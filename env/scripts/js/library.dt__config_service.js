const StudyRepository = require('dt__study_repository'),
      TaskRepository = require('dt__task_repository'),
      StepRepository = require('dt__step_repository')

class ConfigService {

  static getStudyInfo() {
    const study = StudyRepository.getCurrent(),
          tasks = TaskRepository.findSurveysByStudyId(study._id),
          steps = StepRepository.findByTaskIds(tasks.map(task => task._id))
    return { study, tasks, steps }
  }

}

module.exports = ConfigService