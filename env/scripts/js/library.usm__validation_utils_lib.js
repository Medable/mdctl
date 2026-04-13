import { isString } from 'lodash'

const AccountConfiguration = org.read('configuration.accounts', { grant: 'read' })

function validateUsernameMatchesPattern(username) {
  const usernamePattern = AccountConfiguration.usernamePattern
  const regParts = usernamePattern.match(/^\/(.*?)\/([gim]*)$/)
  let regex, match
  if (regParts) {
    // the parsed pattern had delimiters and modifiers. handle them.
    regex = new RegExp(regParts[1], regParts[2])
  } else {
    // we got pattern string without delimiters
    regex = new RegExp(usernamePattern)
  }

  return (isString(username) && username.length > 0 && (match = regex.exec(username)) && match[0].length > 0)
}

module.exports = {
  validateUsernameMatchesPattern,
  AccountConfiguration
}