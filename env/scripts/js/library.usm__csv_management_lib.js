import { route } from 'decorators'
import { LoginMethodsUpdateAllowed, UserNameRequired } from 'usm__utils_lib'

export class CsvManagementLibrary {

    @route({
      method: 'GET',
      name: 'usm__csv_headers',
      path: 'usm/csv/headers',
      acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
    })
  static getCsvHeaders() {
    return [
      { field: 'email', header: 'Email', required: true },
      ...(UserNameRequired ? [{ field: 'username', header: 'Username', required: false }] : []),
      { field: 'firstName', header: 'First Name', required: false },
      { field: 'lastName', header: 'Last Name', required: false },
      { field: 'mobile', header: 'Phone Number', required: false },
      { field: 'userTimeZone', header: 'Time Zone', required: false },
      ...(LoginMethodsUpdateAllowed ? [{ field: 'loginMethods', header: 'Sign In Method', required: false }] : []),
      { field: 'locked', header: 'Lock', required: false },
      { field: 'roles', header: 'Roles', required: false },
      { field: 'sites', header: 'Sites', required: false }
    ]
  }

}