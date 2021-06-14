
/**
 * Class that tracks objects that have been created and allows them to be
 * cleaned up afterwards.
 *
 */
export default class FactoryCleaner {

  constructor(client) {
    this.client = client
    this.trackedObjects = []
    this.deletionOrder = [
      'c_step_response',
      'c_task_response',
      'c_public_user',
      'c_step',
      'c_task',
      'c_anchor_date_template',
      'c_task_assignment',
      'c_patient_flag',
      'c_participant_schedule',
      'c_study'
    ]
  }

  track(object) {
    this.trackedObjects.push(object)
  }

  async clean() {
    await this.client.post(`/cache/key/orphan_records_disabled`, {})
    this.trackedObjects.sort((a, b) => this.deletionOrder.indexOf(a._type) - this.deletionOrder.indexOf(b._type))
    const urls = this.trackedObjects.map(o => o._deleteUrl || o.url)
    let res = await Promise.all(urls.map(async(url) => {
      try {
        await this.client.delete(url)
      } catch (e) {
        if (e.statusCode === 404) {
          return // object was most likely cascade deleted, ignore error.
        }
        if (e.statusCode >= 500) {
          // log unknown errors, don't cause test failures.
          console.log('Error cleaning up object: ', e.message)
          return
        }
        throw e
      }
    }))

    await this.client.delete('/cache/key/orphan_records_disabled')
    return res
  }

}