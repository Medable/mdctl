/**
 * Custom login route
 * @version 1.0.0
 */
import { client } from 'request'

const { _id } = script.principal,
      scope = [
        `object.read.account.${_id}.c_health_data`,
        'object.create.c_health_datum',
        'object.read.c_health_datum'
      ],
      authToken = generateAuthToken(client.key, _id, scope, true)

return authToken

function generateAuthToken(key = client.key, principal, scope, permanent) {
  if (permanent) {
    org.objects.account.revokeSubjectTokens(key, principal)
  }
  const token = org.objects.account.createAuthToken(
    key,
    principal,
    {
      scope,
      permanent
    }
  )

  return token
}