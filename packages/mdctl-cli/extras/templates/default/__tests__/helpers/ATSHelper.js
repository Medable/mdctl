import Api from '../api'
import { pollUntil } from './index'

const client = Api(__API__)

export class ATSHelper {

  static regenerateEventsForUser(publicUser) {
    return client.post('sys/script_runner', {
      publicUser,
      script: `
      import { AdvanceTaskScheduling } from 'c_axon_adv_task_scheduler'
  
      const publicUser = require('request').body.publicUser
  
      return AdvanceTaskScheduling.generateEventsForUser(new ObjectID(publicUser._id))
    
    `
    })
  }

  static async getEventsWaitIfGenerating(publicUser) {

    await pollUntil(async() => {
      const pu = await client.get(`c_public_user/${publicUser._id}`)
      return !pu.c_events_generating
    }, 300)

    return await client.get(`routes/c_public_users/${publicUser._id}/c_events`)
  }

  static async triggerAndWaitForGeneration(publicUser) {
    const pu = await client.get(`c_public_user/${publicUser._id}`)
    if (!pu.c_events_generating) {
      await this.regenerateEventsForUser(publicUser)
    }
    return this.getEventsWaitIfGenerating(publicUser)
  }

}