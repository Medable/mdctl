import faults from 'c_fault_lib'
import nucUtils from 'c_nucleus_utils'
const { expressions: { expression }, log, route, trigger } = require('decorators')
const config = require('config')
const http = require('http')
const { run: runExpression, pipeline: { run: runPipeline } } = require('expressions')
const { keys, isObject, isString, isNumber, isEmpty, isNull, isUndefined, cloneDeep } = require('lodash')
const cache = require('cache')
const { c_looker_entity: LookerEntity, c_looker_integration_record: IntegrationRecord, c_looker_folder_permission: LookerFolderPermissions } = org.objects
const { id: { inIdArray } } = require('util')
const _ = require('lodash')

const roleIdToNameMapping = _.invert(consts.roles)

class Integration {

  vendorIntegrationRecord

  http

  context = {
    ROLES: Object.keys(consts.roles)
      .map((name) => {
        return { _id: consts.roles[name], name }
      }),
    CURRENT_ROLES_NAME: script.principal.roles.map(v => roleIdToNameMapping[v])
  }

  constructor(vendorIntegrationRecord, httpClient) {

    this.vendorIntegrationRecord = vendorIntegrationRecord

    const { c_actions: actions, c_environment: environment } = this.vendorIntegrationRecord

    const environmentConfig = this.readEnvironment(environment)

    this.context = { ...this.context, ENV: environmentConfig }

    if (actions && actions.length) {

      actions
        .forEach((action) => {

          const { c_identifier: identifier } = action

          Object.assign(this, {
            [identifier]: (externalParams) => {

              const result = Integration._sendRequest(httpClient, action, externalParams, this.context)

              return result
            }

          })

        })
    }

  }

  readEnvironment(configKeyName) {

    if (!configKeyName) {
      faults.throw('axon.invalidArgument.invalidConfiguration')
    }

    const environmentConfig = config.get(configKeyName)

    const isEnvironmentDefined = environmentConfig && Object.keys(environmentConfig).length > 0

    if (!isEnvironmentDefined) {
      faults.throw('axon.invalidArgument.invalidConfiguration')
    }

    const { domain } = environmentConfig

    if (!domain) {
      faults.throw('axon.invalidArgument.invalidConfiguration')
    }

    return environmentConfig
  }

  static isDefined(currentVal) {
    if (isNull(currentVal) || isUndefined(currentVal)) {
      return false
    }

    switch (typeof currentVal) {

      case 'string': {
        return !isEmpty(currentVal)
      }

      case 'number': {
        return isNumber(currentVal)
      }

      case 'boolean':
      default:
        return true
    }
  }

  static stringifyQuery(query = {}) {
    return Object
      .keys(query)

    // filter out those values empty
      .filter(key => {
        const currentVal = query[key]
        return this.isDefined(currentVal)
      })

      .map(curr => {

        const currentKey = curr

        const currentVal = query[currentKey]

        return `${currentKey}=${currentVal}`
      })

      .join('&')
  }

  static resolveParams(externalParams = {}, params = {}) {
    return Object
      .keys(params)
      .reduce((acc, key) => {

        const currentValue = params[key]

        const externalValue = externalParams[key]

        const value = this.isDefined(externalValue) ? externalValue : currentValue

        return {
          ...acc,
          [key]: value
        }

      }, {})
  }

  /**
   * Builds and sends a request based on a provided action
   * @param {VendorIntegrationRecord} action Vendor integration action
   * @param {Object} context Context variables the action can have access to
   * @returns a plain object
   */
  @log({ traceError: true })
  static _sendRequest(httpClient, action = {}, externalParams = {}, context = {}) {

    if (!httpClient) {
      httpClient = http
    }

    const { c_identifier: identifier, c_request: request, c_response_transform: response, c_params: params } = action

    if (params) {

      const paramValues = this.resolveParams(externalParams, params)

      context = {
        ...context,
        PARAMS: paramValues
      }

    }

    const { ENV: environment } = context

    if (!identifier) {
      faults.throw('axon.invalidArgument.invalidConfiguration')
    }

    if (!request) {
      faults.throw('axon.invalidArgument.invalidConfiguration')
    }

    const resolvedRequest = this._resolveExpressions(request, context)

    let {
      method,
      path,
      strictSSL,
      headers,
      body,
      buffer,
      timeout,
      sslOptions,
      query
    } = resolvedRequest

    if (!method) {
      faults.throw('axon.invalidArgument.invalidConfiguration')
    }

    if (!path) {
      faults.throw('axon.invalidArgument.invalidConfiguration')
    }

    let url = `${environment.domain}${path}`

    const hasQuery = method.toUpperCase() === 'GET' && query

    if (hasQuery) {
      const queryString = this.stringifyQuery(query)

      url = `${url}?${queryString}`
    }

    if (!isString(body)) {

      if (isObject(body)) {
        body = JSON.stringify(body)
      }

    }

    const options = {
      strictSSL,
      headers,
      body,
      buffer,
      timeout,
      sslOptions
    }

    script.env.name === 'development' && console.log({ url, options })

    let result = httpClient[method.toLowerCase()](url, options)

    if (result.statusCode >= 400) {

      script.env.name === 'development' && console.error({ url, options, ...result })

      const errorBody = JSON.parse(result.body || {})

      return { result: { ...errorBody, statusCode: result.statusCode }, error: true }
    }

    // for now we just support JSON results
    result = JSON.parse(result.body)

    if (response) {

      result = this._resolveExpressions(response, { ...context, RESPONSE: result })

    }

    return { result, error: false }
  }

  /**
  Resolves all expressions in an object
  * @param {Object} The object to resolve
  * @param {Object} The context applied to the expressions found
  * @returns The initial object but this time with the expressions resolved
  */
  static _resolveExpressions(object = {}, context = {}) {

    // eslint-disable-next-line prefer-const
    let result = cloneDeep(object)

    if (result.type) {

      let THIS

      if (result.context) {
        THIS = this._resolveExpressions(result.context, context)
      }

      switch (result.type) {

        case 'expression':

          return runExpression(result.expression, { ...context, THIS })

        case 'expression-pipeline':

          return runPipeline(result.expression, { ...context, THIS })
            .toArray()
      }
    }

    const props = keys(result)

    props.forEach(prop => {

      if (isObject(result[prop])) {

        result[prop] = this._resolveExpressions(result[prop], context)

      }
    })

    return result
  }

}

class Looker extends Integration {

  cachePrefix = 'looker_token'
lookerVendorIntegrationRecord
constructor(httpClient) {
  const vendorIntegrationRecord = IntegrationRecord
    .find({ c_identifier: 'looker' })
    .skipAcl()
    .grant('read')
    .next()

  super(vendorIntegrationRecord, httpClient)
  this.lookerVendorIntegrationRecord = vendorIntegrationRecord
}

// TODO: See if we can move this to an expression
readEnvironment(configKeyName) {
  const environment = super.readEnvironment(configKeyName)

  const {
    user,
    password,
    external_group_id,
    permissions,
    group_ids,
    models,
    session_length,
    personal_folder_name_on_looker
  } = environment

  if (!user || !password || !external_group_id || !permissions || !group_ids || !models || !session_length) {
    faults.throw('axon.invalidArgument.invalidConfiguration')
  }

  if (group_ids.length === 0) {
    faults.throw('axon.invalidArgument.invalidConfiguration')
  }

  if (models.length === 0) {
    faults.throw('axon.invalidArgument.invalidConfiguration')
  }
  if (!personal_folder_name_on_looker) {
    environment.personal_folder_name_on_looker = 'Emebed User'
  }
  return environment
}

getAdminToken() {
  const cacheIdentifier = `${this.cachePrefix}_admin`

  const cachedToken = cache.get(cacheIdentifier)

  if (cachedToken) return cachedToken

  const loginResponse = this.login()

  if (loginResponse.error) {
    throw Fault.create('kAccessDenied')
  }

  const { access_token: adminToken, expires_in: adminTokenExpiration } = loginResponse.result

  cache.set(cacheIdentifier, adminToken, adminTokenExpiration)

  return adminToken
}

getEmbeddedUserToken(adminToken, accId, embeddedUserId) {

  const cacheIdentifier = `${this.cachePrefix}_embedded_${accId}`

  const cachedToken = cache.get(cacheIdentifier)

  if (cachedToken) return cachedToken

  const loginResponse = this.login_as({ token: adminToken, userId: embeddedUserId })

  if (loginResponse.error) {
    faults.throw('axon.invalidArgument.integrationFailed')
  }

  const { access_token: embeddedUserToken, expires_in: embeddedUserTokenExpiration } = loginResponse.result

  cache.set(cacheIdentifier, embeddedUserToken, embeddedUserTokenExpiration)

  return embeddedUserToken
}

createEmbeddedUserIfNotPresent(adminToken, accId) {
  // The following block gets the embedded user id and creates the embedded user if needed
  // we could store embedded user in our end but that would require add
  // a new object just for that, if we eventually need to store more things from looker locally
  // we can refactor this part
  let embeddedUserResponse = this.embed_user({ token: adminToken, externalUserId: accId })

  if (embeddedUserResponse.error) {

    if (embeddedUserResponse.result.statusCode !== 404) {
      faults.throw('axon.invalidArgument.integrationFailed')
    }

    this.generateEmbeddedUser(adminToken, accId)

    embeddedUserResponse = this.embed_user({ token: adminToken, externalUserId: accId })

    if (embeddedUserResponse.error) {
      faults.throw('axon.invalidArgument.integrationFailed')
    }

  }
  //

  return embeddedUserResponse.result
}

authenticate(accId, opts = { user: 'admin' }) {

  const cacheIdentifier = opts.user === 'admin' ? `${this.cachePrefix}_${opts.user}` : `${this.cachePrefix}_embedded_${accId}`

  const token = cache.get(cacheIdentifier)

  // if the token is cached return it
  if (token) {
    return token
  }

  const adminToken = this.getAdminToken()

  if (opts.user === 'admin') {
    return adminToken
  }

  const embeddedUser = this.createEmbeddedUserIfNotPresent(adminToken, accId)

  const userToken = this.getEmbeddedUserToken(adminToken, accId, embeddedUser.id)

  return userToken
}

generateEmbeddedUser(adminToken, accId) {
  // doesnt really matter this is just to generate the embeddedUser
  const listConfig = {
    token: adminToken,
    entity: 'dashboards',
    limit: 1
  }

  const dashboardsResponse = this.list(listConfig)

  if (dashboardsResponse.error) {
    faults.throw('axon.invalidArgument.integrationFailed')
  }

  const [firstDashboard] = dashboardsResponse.result

  if (!firstDashboard) {
    faults.throw('axon.invalidArgument.integrationFailed')
  }

  const { preferred_viewer, id } = firstDashboard

  const resource = `/${preferred_viewer}/${id}`

  const ssoUrlResponse = this.sso_url({
    token: adminToken,
    resource,
    externalUserId: accId
  })

  if (ssoUrlResponse.error) {
    faults.throw('axon.invalidArgument.integrationFailed')
  }

  // this is a hack to create the embedded user
  // as of Looker API v 3.1 there is no method to create
  // an embedded user other than accessing an SSO Url
  http.get(ssoUrlResponse.result.url)
}

listEntities({ accId, entity, folderId, folderEntity, query }, isForBulkPermission = false) {
  let authConfig = { user: 'embedded' }

  const token = this.authenticate(accId, authConfig)
  const list_config = { token, entity, ...query }
  let listConfig = {}
  for (const key in list_config) {
    if (key !== 'limit' && key !== 'offset') {
      listConfig[key] = list_config[key]
    }
  }
  let list = this.list
  const { c_environment: environment } = this.vendorIntegrationRecord
  const environmentConfig = this.readEnvironment(environment)
  if (entity === 'explores') {

    authConfig = { user: 'admin' }

    list = this.explores

  } else if (entity === 'folders' && folderId && folderEntity) {

    list = this.folder_content

    listConfig = {
      ...listConfig,
      folderId,
      folderEntity
    }

  }
  const entitiesResponse = list(listConfig)
  if (entitiesResponse.error) {
    faults.throw('axon.invalidArgument.integrationFailed')
  }
  if (!isForBulkPermission) {
    this.configureListEntitiesResponse(entity, environmentConfig, entitiesResponse, folderId, folderEntity)
  }
  const paginatedResponse = (typeof list_config.offset !== 'undefined' && typeof list_config.limit !== 'undefined') ? entitiesResponse.result.slice(list_config.offset, list_config.offset + list_config.limit) : entitiesResponse.result
  return paginatedResponse
}

createFolder({ parentFolderId, folderName, folderPermissions, accId }) {
  const authConfig = { user: 'embedded' }
  const token = this.authenticate(accId, authConfig)
  const params = { parentFolderId: parentFolderId, folderName: folderName, token: token }
  const folderResponse = this.create_folder(params)
  if (folderResponse.error) {
    faults.throw('axon.invalidArgument.integrationFailed')
  }
  const folder_Id = folderResponse.result.id
  this.addRolePermissionsToFolder(folderPermissions, folder_Id)
  return { folder_Id, folderName }
}

updateFolder({ accId, folderId, folderName, parentFolderId, folderPermissions }) {
  if (folderId && folderName) {
    const authConfig = { user: 'embedded' }
    const token = this.authenticate(accId, authConfig)
    const params = { folderId: folderId, parentFolderId: parentFolderId, folderName: folderName, token: token }
    const folderResponse = this.update_folder(params)
    if (folderResponse.error) {
      faults.throw('axon.invalidArgument.integrationFailed')
    }
    folderName = folderResponse.result.name
  }
  if (folderPermissions) {
    this.removeRolePermissionsFromFolder(folderId)
    this.addRolePermissionsToFolder(folderPermissions, folderId)
  }

  return { folderId, folderName }
}

deleteFolder({ accId, folderId }) {
  const authConfig = { user: 'embedded' }
  const token = this.authenticate(accId, authConfig)
  const params = { folderId: folderId, token: token }
  const folderResponse = this.delete_folder(params)
  if (folderResponse.error) {
    faults.throw('axon.invalidArgument.integrationFailed')
  }
  this.removeRolePermissionsFromFolder(folderId)
  return true
}

addRolePermissionsToFolder(folderPermissions, folderId) {
  LookerFolderPermissions.insertOne({
    c_folder_id: folderId,
    c_folder_access_roles: folderPermissions
  })
    .skipAcl()
    .grant('update')
    .execute()
}

removeRolePermissionsFromFolder(folderId) {
  LookerFolderPermissions
    .deleteMany({ c_folder_id: folderId })
    .skipAcl()
    .grant('delete')
    .execute()
}

listEntitiesforBulkPermissions({ accId, entity }) {
  const folders = this.listEntities({ accId, entity }, true)
  const rootTreeNode = {
    id: null,
    foldername: '',
    children: []
  }
  // Use DFS to Build The Folder Tree
  this.buildTree(rootTreeNode, folders)
  return rootTreeNode
}

buildTree(node, lookerFoldersEntities) {
  this.getChildren(node, lookerFoldersEntities)
  node.children.forEach(child => {
    this.buildTree(child, lookerFoldersEntities)
  })
}

getChildren(node, lookerFoldersEntities) {
  lookerFoldersEntities.forEach(element => {
    if (element.parent_id === node.id) {
      const childNode = {
        id: element.id,
        foldername: element.name,
        children: []
      }
      node.children.push(childNode)
    }
  })
}

addBulkPermissionToFolders(folders) {
  folders.forEach(element => {
    const folderPermissionCursor = LookerFolderPermissions.find(
      {
        c_folder_id: element.id
      })
      .paths('c_folder_access_roles')
      .skipAcl()
      .grant('read')
    if (folderPermissionCursor.hasNext()) {
      this.removeRolePermissionsFromFolder(element.id)
      this.addRolePermissionsToFolder(element.permissions, element.id)
    } else {
      this.addRolePermissionsToFolder(element.permissions, element.id)
    }
  })
  return true
}

moveFolderToSubFolder({ parentFolderId, folderId, folderName, accId }) {
  const authConfig = { user: 'embedded' }
  const token = this.authenticate(accId, authConfig)
  let params = { folderId: folderId, token: token }
  let folderResponse = this.delete_folder(params)
  params = { parentFolderId: parentFolderId, folderName: folderName, token: token }
  folderResponse = this.create_folder(params)
  if (folderResponse.error) {
    faults.throw('axon.invalidArgument.integrationFailed')
  }
  const folder_Id = folderResponse.result.id
  const parent_Id = folderResponse.result.parent_id
  const folderPermissionCursor = LookerFolderPermissions.find(
    {
      c_folder_id: folderId
    })
    .skipAcl()
    .grant('read')
  if (!folderPermissionCursor.hasNext()) {
    faults.throw('axon.invalidArgument.integrationFailed')
  }
  const folderPermissions = folderPermissionCursor.next()
  const previousId = folderPermissions._id
  LookerFolderPermissions.updateOne({ _id: previousId }, { $set: { c_folder_id: folder_Id } })
    .skipAcl()
    .grant('update')
    .execute()
  return { folder_Id, folderName, parent_Id }
}

configureListEntitiesResponse(entity, environmentConfig, entitiesResponse, folderId, folderEntity) {
  if (entity === 'folders' && !folderId && !folderEntity) {
    if (environmentConfig.visible_folders_names) {
      const rankHashTable = {}
      entitiesResponse.result = entitiesResponse.result
        .filter(entity => {
          const filterFolder = () => {
            if (entity.id in environmentConfig.visible_folders_names) {
              entity.name = environmentConfig.visible_folders_names[entity.id].name === '' ? entity.name : environmentConfig.visible_folders_names[entity.id].name
              rankHashTable[entity.id] = environmentConfig.visible_folders_names[entity.id].rank
              return entity
            } else {
              // To Support Backward Compatibility So Previous Tests can Pass
              if (entity.name === environmentConfig.personal_folder_name_on_looker) {
                if (environmentConfig.personal_folder_name && environmentConfig.personal_folder_name.name) {
                  entity.name = environmentConfig.personal_folder_name.name
                  rankHashTable[entity.id] = environmentConfig.personal_folder_name.rank
                }
                return entity
              }
            }
          }
          const folderPermissionCursor = LookerFolderPermissions.find(
            {
              c_folder_id: entity.id
            })
            .paths('c_folder_access_roles')
            .skipAcl()
            .grant('read')
          if (folderPermissionCursor.hasNext()) {
            const folderPermissions = folderPermissionCursor.next()
            const hasaccess = folderPermissions.c_folder_access_roles.some(item => inIdArray(script.principal.roles, item))
            if (hasaccess) {
              return filterFolder()
            }
          } else {
            return filterFolder()
          }
        })
        .sort((a, b) => {
          const aRank = rankHashTable[a.id]
          const bRank = rankHashTable[b.id]
          if (aRank < bRank) {
            return -1
          }
          if (aRank > bRank) {
            return 1
          }
          return 0
        })
    }
  }
}

getSSOUrl(accId, resource) {
  const adminToken = this.authenticate()

  this.createEmbeddedUserIfNotPresent(adminToken, accId)

  const ssoUrlResponse = this.sso_url({
    token: adminToken,
    externalUserId: accId,
    resource
  })

  if (ssoUrlResponse.error) {
    faults.throw('axon.invalidArgument.integrationFailed')
  }

  return ssoUrlResponse.result
}

}

class LookerRuntimes {

  static fieldMapping = {
    c_looker_id: 'id',
    c_looker_title: 'title',
    c_looker_name: 'name',
    c_looker_label: 'label',
    c_looker_model: 'model'
  }

  static entityMapping = {
    dashboards: 'c_looker_dashboard',
    folders: 'c_looker_folder',
    explores: 'c_looker_explore'
  }

  static mapCortexFieldToLooker(cortexField) {
    return this.fieldMapping[cortexField]
  }

  static mapLookerFieldToCortex(lookerField) {
    return Object
      .keys(this.fieldMapping)
      .find((key) => {
        const value = this.fieldMapping[key]
        return value === lookerField
      })
  }

  static mapLookerModelToCortex(entityName, entity) {

    if (!entityName || !entity) return

    const type = this.entityMapping[entityName]

    if (!type) return

    const cortexModel = Object.keys(entity)
      .filter(propName => this.mapLookerFieldToCortex(propName))
      .reduce((acc, curr) => {
        const value = entity[curr]

        const cortexKey = this.mapLookerFieldToCortex(curr)

        return { ...acc, [cortexKey]: value }
      }, {})

    // eslint-disable-next-line no-undef
    return { type, ...cortexModel, _id: new ObjectID() }
  }

  static sortAdapter(sort) {

    if (!sort) return sort

    const [sortField] = Object.keys(sort)

    if (!sortField) return

    const lookerField = this.mapCortexFieldToLooker(sortField)

    if (!lookerField) return

    const sortingDirection = sort[sortField] === 1 ? 'asc' : 'desc'

    return `${lookerField} ${sortingDirection}`

  }

  static resolveFields(ctxWhere) {
    const fields = Object.keys(ctxWhere)

    if (!fields) return

    return fields
      .filter(field => this.mapCortexFieldToLooker(field))
      .filter(field => {
        const fieldValue = ctxWhere[field]

        return fieldValue.$eq || fieldValue.$in
      })
      .map(field => {
        const fieldValue = ctxWhere[field]
        const filterBy = this.mapCortexFieldToLooker(field)

        let result

        if (fieldValue.$eq) {

          result = { [filterBy]: fieldValue.$eq }

        } else if (fieldValue.$in) {

          result = { [filterBy]: fieldValue.$in.join(',') }

        }

        return result
      })
      .reduce((acc, curr) => {
        const [[key, value]] = Object.entries(curr)
        return { ...acc, [key]: value }
      }, {})
  }

  static whereAdapter(where) {

    let filterObject

    if (!where) return

    if (where.$or) {

      filterObject = where.$or
        .map(condition => this.resolveFields(condition))

        .reduce((acc, curr) => {

          const [[key, value]] = Object.entries(curr)

          const existingVal = acc[key]

          if (existingVal) {
            return { ...acc, [key]: `${existingVal},${value}` }
          }

          return { ...acc, [key]: value }
        }, {})

      filterObject = { ...filterObject, filter_or: true }

    } else {

      filterObject = this.resolveFields(where)

    }

    return filterObject

  }

  static queryAdapter(query) {
    const { skip, limit, sort, where } = query
    // const {sort, where } = query

    let parsedWhere

    if (where) {
      try {
        parsedWhere = JSON.parse(where)
      } catch (err) {}
    }

    const adaptedQuery = {
      limit,
      offset: skip,
      sorts: this.sortAdapter(sort),
      ...this.whereAdapter(parsedWhere)
    }

    // const adaptedQuery = {
    //   sorts: this.sortAdapter(sort),
    //   ...this.whereAdapter(parsedWhere)
    // }

    // clean undefined
    return { ...adaptedQuery }
  }

  static hasAccess() {

    const studyManagerAppRole = consts.roles.c_dm_app
    const { read } = consts.accessLevels

    const { defaultAcl } = org.objects.object
      .find({ name: 'c_looker_entity' })
      .skipAcl()
      .grant(read)
      .paths('defaultAcl')
      .next()
    let sitesCursor
    if (!nucUtils.isNewSiteUser(script.principal.roles)) {
      sitesCursor = org.objects
        .c_sites
        .find()
        .paths('accessRoles')
        .limit(1)
    } else {
      sitesCursor = org.objects
        .accounts
        .find()
        .pathPrefix(`${script.principal._id}/c_sites`)
        .paths('accessRoles')
        .limit(1)
    }

    let roles

    if (sitesCursor.hasNext()) {

      const { accessRoles } = sitesCursor
        .next()

      console.log(accessRoles)

      roles = accessRoles

    } else {

      roles = script.principal.roles

    }

    const match = defaultAcl
      .filter(({ target }) => !!target)
      .find(({ allow, target }) => {
        const canRead = allow >= read
        const isRoleAssigned = inIdArray(roles, target)

        const hasStudyManagerRole = inIdArray(roles, studyManagerAppRole)

        return isRoleAssigned && hasStudyManagerRole && canRead
      })

    return !!match
  }

  @expression
  looker__create_embedded_user = {
    $and: [
      // looker integration should be configured
      {
        $config: 'looker_integration_config'
      },
      // the vendor integration record must be present
      {
        $dbNext: {
          maxTimeMS: 10000,
          grant: 'read',
          object: 'c_looker_integration_record',
          operation: 'cursor',
          skipAcl: true,
          paths: [
            '_id'
          ],
          where: {
            c_identifier: 'looker'
          }
        }
      },
      // the account must not have a public user
      {
        $eq: [{
          $dbNext: {
            $object: {
              grant: { $literal: 'read' },
              maxTimeMS: { $literal: 10000 },
              object: { $literal: 'c_public_user' },
              operation: { $literal: 'cursor' },
              paths: { $array: ['_id'] },
              skipAcl: { $literal: true },
              where: {
                $object: { c_account: { $pathTo: ['$current', '_id'] } }
              }
            }
          }
        }, null]
      }
    ]
  }

  /**
   * @openapi
   * /integrations/looker/checkReportingAccessibility:
   *  get:
   *    description: 'checks if advance reporting is enabled in an org'
   *
   *    responses:
   *      '200':
   *        description: org.configuration.reporting.enabled
   */
       @log({ traceError: true })
       @route({
         method: 'GET',
         name: 'c_looker_report_accesibility',
         path: 'integrations/looker/checkReportingAccessibility'
       })
  static checkLookerReportingAccessibility() {
    const config = org.objects.org.readOne()
      .execute()
    return config.configuration.reporting.enabled
  }

  /**
   * @openapi
   * /integrations/looker/{entity}/{folderId}/{folderEntity}:
   *  get:
   *    description: 'looker site'
   *    parameters:
   *      - name: folderEntity
   *        in: path
   *        required: false
   *      - name: folderId
   *        in: path
   *        required: false
   *      - name: entity
   *        in: path
   *        required: true
   *
   *    responses:
   *      '200':
   *        description: a looker entity
   */
  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'c_looker_list',
    path: 'integrations/looker/:entity/:folderId?/:folderEntity?'
  })
       static list({ req: { query, params: { entity: entityName, folderId, folderEntity } } }) {
         if (!this.hasAccess()) {
           return []
         }
         const lookerIntegration = new Looker()
         const config = {
           accId: script.principal._id,
           entity: entityName,
           folderId,
           folderEntity,
           query: this.queryAdapter(query)
         }
         return lookerIntegration
           .listEntities(config)
           .map(entity => {
             const currentEntityName = folderEntity || entityName
             return new LookerEntity(this.mapLookerModelToCortex(currentEntityName, entity))
           })
       }

  /**
   * @openapi
   * /integrations/looker/sso_url:
   *  post:
   *    description: 'Looker SSO URL'
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              resource:
   *                type: string
   *                description: Looker resource
   *
   *    responses:
   *      '200':
   *        description: the looker integration
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_looker_sso_url',
    path: 'integrations/looker/sso_url'
  })
  static generateSSOUrl({ body }) {

    if (!this.hasAccess()) {
      throw Fault.create('kAccessDenied')
    }

    const lookerIntegration = new Looker()

    const { resource } = body()

    if (!resource) {
      throw Fault.create('kInvalidArgument')
    }

    return lookerIntegration
      .getSSOUrl(script.principal._id, resource)
  }

  /**
   * @openapi
   * /integrations/looker/create_folder:
   *  post:
   *    description: 'Create folder'
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              parentFolderId:
   *                type: string
   *              folderName:
   *                type: string
   *              folderPermissions:
   *                type: string
   *
   *    responses:
   *      '200':
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                folder_Id:
   *                  type: string
   *                folderName:
   *                  type: string
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_create_folder',
    path: 'integrations/looker/create_folder'
  })
  static createFolder({ body }) {

    if (!this.hasAccess()) {
      throw Fault.create('kAccessDenied')
    }

    const lookerIntegration = new Looker()

    const params = body()
    params.accId = script.principal._id
    return lookerIntegration
      .createFolder(params)
  }

  /**
   * @openapi
   * /integrations/looker/update_folder:
   *  patch:
   *    description: 'Update folder'
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              parentFolderId:
   *                type: string
   *              folderName:
   *                type: string
   *              folderPermissions:
   *                type: string
   *              folderId:
   *                type: string
   *
   *    responses:
   *      '200':
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                folder_Id:
   *                  type: string
   *                folderName:
   *                  type: string
   */
  @log({ traceError: true })
  @route({
    method: 'PATCH',
    name: 'c_update_folder',
    path: 'integrations/looker/update_folder'
  })
  static updateFolder({ body }) {

    if (!this.hasAccess()) {
      throw Fault.create('kAccessDenied')
    }

    const lookerIntegration = new Looker()

    const params = body()
    params.accId = script.principal._id
    return lookerIntegration
      .updateFolder(params)
  }

  /**
   * @openapi
   * integrations/looker/delete_folder/{folderId}:
   *  delete:
   *    description: 'Delete folder'
   *    parameters:
   *      - name: folderId
   *        in: path
   *        required: true
   *
   *    responses:
   *      '200':
   *        description: always true
   */
  @log({ traceError: true })
  @route({
    method: 'DELETE',
    name: 'c_delete_folder',
    path: 'integrations/looker/delete_folder/:folderId'
  })
  static deleteFolder({ req }) {

    if (!this.hasAccess()) {
      throw Fault.create('kAccessDenied')
    }

    const lookerIntegration = new Looker()

    const { folderId } = req.params
    const accId = script.principal._id
    const params = { accId, folderId }
    return lookerIntegration
      .deleteFolder(params)
  }

  /**
   * @openapi
   * /integrations/looker/list:
   *  get:
   *    description: 'list all'
   *
   *    responses:
   *      '200':
   *        description: all looker entities
   */
  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'c_looker_list_all',
    path: 'integrations/looker/list'
  })
  static listAllFolders() {

    if (!this.hasAccess()) {
      throw Fault.create('kAccessDenied')
    }

    const lookerIntegration = new Looker()

    const params = {
      accId: script.principal._id,
      entity: 'folders'
    }
    return lookerIntegration
      .listEntitiesforBulkPermissions(params)
  }

  /**
   * @openapi
   * /integrations/looker/bulk_permission:
   *  post:
   *    description: 'Bulk permissions'
   *    requestBody:
   *      description: Provide the folder ID and corresponding permissions
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: array
   *            items:
   *              type: object
   *              properties:
   *                id:
   *                  type: string
   *                  description: folder id
   *                permissions:
   *                  type: string
   *                  description: folder permissions
   *
   *    responses:
   *      '200':
   *        description: the looker integration
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_bulk_permission',
    path: 'integrations/looker/bulk_permission'
  })
  static addBulkPermissions({ body }) {

    if (!this.hasAccess()) {
      throw Fault.create('kAccessDenied')
    }

    const lookerIntegration = new Looker()

    const params = body()
    const folders = params.folders
    return lookerIntegration
      .addBulkPermissionToFolders(folders)
  }

  /**
   * @openapi
   * /integrations/looker/move_sub_folder:
   *  post:
   *    description: 'Move sub folder'
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              parentFolderId:
   *                type: string
   *              folderName:
   *                type: string
   *              folderId:
   *                type: string
   *
   *    responses:
   *      '200':
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                folder_Id:
   *                  type: string
   *                folderName:
   *                  type: string
   *                parent_Id:
   *                  type: string
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_move_sub_folder',
    path: 'integrations/looker/move_sub_folder'
  })
  static moveSubFolder({ body }) {

    if (!this.hasAccess()) {
      throw Fault.create('kAccessDenied')
    }

    const lookerIntegration = new Looker()

    const params = body()
    params.accId = script.principal._id
    return lookerIntegration
      .moveFolderToSubFolder(params)
  }

  @log({ traceError: true })
  @trigger('create.after', 'update.after', {
    object: 'account',
    if: {
      $looker__create_embedded_user: '$$ROOT'
    },
    rootDocument: 'runtime'
  })
  static accountCreationOrEdition({ new: newAccount }) {

    const lookerIntegration = new Looker()

    const { _id: accId } = newAccount

    const adminToken = lookerIntegration.authenticate()

    lookerIntegration.createEmbeddedUserIfNotPresent(adminToken, accId)

  }

}

module.exports = {
  Integration,
  Looker,
  LookerRuntimes
}