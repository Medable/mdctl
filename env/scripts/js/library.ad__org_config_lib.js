import { route } from 'decorators'

export class OrgConfigLibrary {

    @route({
      method: 'GET',
      name: 'ad__ad_deployed',
      path: 'ad'
    })
  static isAdDeployed() {
    const AD_APP_NAME = 'ad__app'
    const apps = org.objects.org
      .find()
      .skipAcl()
      .grant('read')
      .paths('apps')
      .next()
      .apps
      .map(({ name }) => name)

    return apps.includes(AD_APP_NAME)
  }

}