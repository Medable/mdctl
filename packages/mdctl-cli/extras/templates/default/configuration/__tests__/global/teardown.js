/* eslint-disable no-undef */
import Provisioner from '../provisioner'
import Api from '../api'

export default async function() {
  const client = Api(global.__API__),
        provisioner = Provisioner(client)
  await provisioner
    .clean()
}
