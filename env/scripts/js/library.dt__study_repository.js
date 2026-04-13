const { c_study } = org.objects

class StudyRepository {

  static getCurrent() {
    return c_study
      .find()
      .next()
  }

}

module.exports = StudyRepository