const { as } = require('decorators'),
      { c_study } = org.objects,
      { accessLevels } = consts

/**
 * Study Repository
 *
 * @class StudyRepository
 */

class StudyRepository {

  /**
   * Get study
   * @memberOf StudyRepository
   * @return {Object} study
   */
  static get() {
    return c_study
      .find()
      .next()
  }

  /**
   * Update c_automatic_participant_id_generation
   * @memberOf StudyRepository
   * @param {String} studyId
   * @param {Boolean} isEnabled
   * @return {Object} update result
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.update } })
  static updateAutomaticParticipantIdGeneration(studyId, isEnabled) {
    return c_study
      .updateOne({
        _id: studyId
      },
      {
        $set: {
          c_automatic_participant_id_generation: isEnabled
        }
      })
      .execute()
  }

}

module.exports = { StudyRepository }