const RoleIdsNotAccessibleToSupportUser = ['Administrator', 'Developer'].map(role => consts.roles[role].toString())
const RoleIdsNotAccessibleToUSMUser = ['Administrator', 'Developer', 'Support'].map(role => consts.roles[role].toString())

module.exports = {
  RoleIdsNotAccessibleToSupportUser,
  RoleIdsNotAccessibleToUSMUser
}