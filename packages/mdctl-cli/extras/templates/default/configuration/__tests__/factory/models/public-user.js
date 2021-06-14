import ObjectBuilder from '../base/object-builder'

export default class PublicUser extends ObjectBuilder {

  static _type() {
    return 'c_public_user'
  }

  async buildAsPublicSignup() {
    if (!this.properties.c_study) {
      throw new Error('Must set c_study before attempting to buildWithPublicSignup.')
    }
    const anonymousClient = this.objectInstance.client.anonymousClient(),
          response = await anonymousClient.get(
            'routes/study_subject_information',
            {
              c_study: this.properties.c_study
            }
          )
    this.objectInstance.updateProperties(response.c_public_user)
    this.lastResponse = response

    // Allow simple research registration.
    this.objectInstance.doResearchRegister = async(registerParams) => {
      delete this.objectInstance.doResearchRegister

      const credentials = {
        email: `${this.constructor.uniqueId()}@medable.com`,
        password: this.constructor.uniqueId()
      }

      const researchRegRoute = 'routes/research_register'
      await anonymousClient.post(
        'routes/research_register',
        {
          account: {
            name: {
              first: this.constructor.uniqueId(),
              last: this.constructor.uniqueId()
            },
            mobile: '+15055555555',
            ...credentials
          },
          c_public_user: this.objectInstance._id,
          ...registerParams
        }
      )

      this.objectInstance.client = anonymousClient.clientForCreds(credentials)

      await this.objectInstance.client.login()
    }

    return this.objectInstance
  }

}