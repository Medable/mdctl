/***********************************************************

@script     Axon Mobile App Version Library

@brief      Contains the route and and data integrity logic for native mobile app versions

@author     Chris Fraschetti

(c)2023 Medable, Inc.  All Rights Reserved.

***********************************************************/

/**
 * @openapi
 * /mobileUpgradeRequired:
 *  get:
 *    description: "Given an application (patios or patandroid) and the current client app version, returns data denoting whether or not an app update is required"
 *    parameters:
 *      - name: application
 *        required: true
 *        in: query
 *        description: Specifies the client application
 *        schema:
 *          type: string
 *      - name: version
 *        required: true
 *        in: query
 *        description: Specifies the current client application version
 *        schema:
 *          type: string
 *    responses:
 *      '200':
 *        description: Successfully returned the upgrade required response document
 *        content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - upgradeRequired
 *               - minimumVersion
 *               - applicationID
 *             properties:
 *               upgradeRequired:
 *                 type: boolean
 *               minimumVersion:
 *                 type: string
 *               applicationID:
 *                 type: integer
 *      '400':
 *        description: Bad request (kInvalidArgument). You must provide valid application and version parameters.
 */

import { log, trigger, route } from 'decorators'
import logger from 'logger'
import config from 'config'
import semver from 'semver'
import faults from 'c_fault_lib'

const VERBOSE = false

const versionMatcher = /^([0-9]+)(?:.([0-9]+))?(?:.([0-9]+))?/

// eslint-disable-next-line no-unused-vars
class AxonMobileAppVersionHandler {

  /*
  'after' triggers are used so the new documents are written before we delete
   or update other documents. This flow is important to ensure we do not introduce
   a race condition where we are not returning the current nor latest data
   */
  @log({ traceResult: true, traceError: true })
  @trigger('create.after', 'update.after', {
    object: 'c_axon_mobile_app_version',
    weight: 1,
    principal: 'c_system_user'
  })
  static createdAppVersion({ event, context, old }) {

    if (VERBOSE) {
      logger.info(`Event: ${event}`)
      logger.info(`Context: ${JSON.stringify(context)}`)
    }

    const docID = context._id.toString()
    // application is persisted trimmed and lowered on ingest so all queries will need to duplicate this logic
    let newVerApplication = context.c_application
    let newVerVersion = context.c_version
    let newVerRequiredVersion = context.c_required_version

    // For updates, if context has the attribute, it's the new version - which we want. Otherwise we pull from old
    if (event === 'update.after') {
      if (newVerApplication === undefined) {
        newVerApplication = old.c_application
      }

      if (newVerVersion === undefined) {
        newVerVersion = old.c_version
      }

      if (newVerRequiredVersion === undefined) {
        newVerRequiredVersion = old.c_required_version
      }
    }

    if (VERBOSE) {
      logger.info(`docID: ${docID}`)
      logger.info(`newVerApplication: ${newVerApplication}`)
      logger.info(`newVerVersion: ${newVerVersion}`)
      logger.info(`newVerRequiredVersion: ${newVerRequiredVersion}`)
    }

    // Duplicates can be introduced both via new doucuments as well as updates to existing documents
    this.deleteDuplicateVersions(docID, newVerApplication, newVerVersion)

    if (newVerRequiredVersion) {
      this.enforceSingleRequiredVersion(docID, newVerApplication)
    }

    if (VERBOSE) {
      logger.info('Done')
    }

    return true
  }

  /*
  deleteMany is not viable without the $ne argument so we'll instead find and update manually
  if all goes well, we should only ever have a max of 1 document to delete. not painful but not painless.
  Collecting ids and deleting in bulk was an option but given the max(1) condition, it was unnecessary complexity
  */
  static deleteDuplicateVersions(currentDocID, application, version) {
    if (VERBOSE) {
      logger.info('Deleting duplicate version(s) for this application+version combination')
    }

    const versionCursor = org.objects.c_axon_mobile_app_version
      .find({ c_application: application, c_version: version })
      .skipAcl()
      .grant(consts.accessLevels.read)

    while (versionCursor.hasNext()) {
      const versionDoc = versionCursor.next()
      const version = versionDoc._id.toString()

      if (currentDocID === version) {
        if (VERBOSE) {
          logger.info(`Skipping current version document: ${version}`)
        }

        continue
      }

      if (VERBOSE) {
        logger.info(`Deleting existing duplicate document: ${version}`)
      }

      const deleteResult = org.objects.c_axon_mobile_app_version
        .deleteOne({ _id: version })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()

      if (VERBOSE) {
        logger.info(`deleteOne result: ${JSON.stringify(deleteResult)}`)
      }
    }
  }

  /*
  updateMany is not viable without the $ne argument so we'll instead find and update manually
  if all goes well, we should only ever have a max of 1 document to update. not painful but not painless.
  */
  static enforceSingleRequiredVersion(currentDocID, application) {
    if (VERBOSE) {
      logger.info('Attempting to ensure only one c_required_version exists for this application')
    }

    const versionCursor = org.objects.c_axon_mobile_app_version
      .find({ c_application: application, c_required_version: true })
      .skipAcl()
      .grant(consts.accessLevels.read)

    const docsToUpdate = [] // doc _id

    while (versionCursor.hasNext()) {
      const versionDoc = versionCursor.next()
      const versionId = versionDoc._id.toString()

      if (currentDocID === versionId) {
        if (VERBOSE) {
          logger.info(`Skipping current version document: ${versionId}`)
        }

        continue
      }

      docsToUpdate.push(versionId)
    }

    this.executeSingleRequiredVersionUpdate(docsToUpdate)
  }

  static executeSingleRequiredVersionUpdate(ids) {
    if (VERBOSE) {
      logger.info(`ID count to update (to c_required_version=false): ${ids.length}`)
    }

    const batchSize = 99 // The max update operations allowed in a single updateMany
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchContents = ids.slice(i, i + batchSize)

      if (VERBOSE) {
        logger.info(`Executing updateMany batch ${i + 1} with ${batchContents} IDs`)
      }

      const updateResult = org.objects.c_axon_mobile_app_version
        .updateMany({ _id: { $in: batchContents } }, {
          $set: {
            c_required_version: false
          }
        })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()

      if (VERBOSE) {
        logger.info(`updateMany batch ${i + 1} result: ${JSON.stringify(updateResult)}`)
      }
    }
  }

  @log({ traceError: true })
  @route({
    weight: 1,
    method: 'GET',
    name: 'c_check_mobile_app_upgrade_required',
    path: 'mobileUpgradeRequired',
    acl: ['account.anonymous']
  })
  static get({ req, res }) {

    const queryArgs = req.query

    if (VERBOSE) {
      logger.info(`queryArgs: ${JSON.stringify(queryArgs)}`)
    }

    const rawClientAppName = queryArgs.application

    if (!rawClientAppName) {
      faults.throw('axon.invalidArgument.validAppAndVersionRequired')
    }

    // application is persisted trimmed and lowered on ingest so all queries will need to duplicate this logic
    const client_app_name = rawClientAppName.trim()
      .toLowerCase()

    if (!['patios', 'patandroid'].includes(client_app_name)) {
      faults.throw('axon.invalidArgument.validAppAndVersionRequired')
    }

    const clientAppVer = queryArgs.version
    if (!clientAppVer) {
      faults.throw('axon.invalidArgument.validAppAndVersionRequired')
    }

    // Values for the return object
    let updatedRequired = false
    let minVerRequired = ''
    let applicationID = ''

    const forcedUpgradesEnabled = config('feature_flags_global.enableforcedmobileupdates-ops-20230418')

    if (forcedUpgradesEnabled) {

      // eslint disabled as performance is global within node & duktape
      const queryStart = performance.now() // eslint-disable-line no-undef

      const versionCursor = org.objects.c_axon_mobile_app_version
        .find({ c_application: client_app_name, c_required_version: true })
        .skipAcl()
        .grant(consts.accessLevels.read)

      const minVerRequiredObj = versionCursor.hasNext() && versionCursor.next()

      // eslint disabled as performance is global within node & duktape
      const queryElapsed = performance.now() - queryStart // eslint-disable-line no-undef

      if (VERBOSE) {
        logger.info(`minVerRequiredObj: ${JSON.stringify(minVerRequiredObj)}`)
        logger.info(`Query execution time(ms): ${queryElapsed.toFixed(2)}`)
        res.setHeader('Query-Execution-Time', `${queryElapsed.toFixed(2)}`)
      }

      if (minVerRequiredObj) {
        minVerRequired = minVerRequiredObj.c_version
      }

      switch (client_app_name) {
        case 'patios':
          applicationID = config('axon__mobile_applications.patient_ios.applicationId')
          updatedRequired = this.iOSUpgradeRequired(minVerRequired, clientAppVer)
          break
        case 'patandroid':
          applicationID = config('axon__mobile_applications.patient_android.applicationId')
          updatedRequired = this.androidUpgradeRequired(minVerRequired, clientAppVer)
          break
      }
    }

    return {
      upgradeRequired: updatedRequired,
      minimumVersion: minVerRequired,
      applicationID: applicationID
    }
  }

  // iOS version comparison - SemVer (ex: 5.4.0)
  static iOSUpgradeRequired(minimumRequiredVersion, currentClientVersion) {
    if (!minimumRequiredVersion || !currentClientVersion) {
      return false
    }

    // Normalize the versions to the major.minor.patch format required by our semver library
    const normalizedCurrentClientVersion = this.normalizeVersion(currentClientVersion)
    const normalizedMinimumRequiredVersion = this.normalizeVersion(minimumRequiredVersion)

    if (VERBOSE) {
      logger.info(`normalizedCurrentClientVersion: ${normalizedCurrentClientVersion}`)
      logger.info(`normalizedMinimumRequiredVersion: ${normalizedMinimumRequiredVersion}`)
    }

    const upgradeRequired = semver.lt(normalizedCurrentClientVersion, normalizedMinimumRequiredVersion)

    if (VERBOSE) {
      logger.info(`currentClientVersion: ${currentClientVersion} < minimumRequiredVersion: ${minimumRequiredVersion} = ${upgradeRequired}`)
    }

    return upgradeRequired
  }

  // Android versionCode comparison - Simple number comparison (ex: 504000331)
  static androidUpgradeRequired(minimumRequiredVersion, currentClientVersion) {
    if (!minimumRequiredVersion || !currentClientVersion) {
      return false
    }

    const parse = (v) => v.split('.').map(Number)

    const [minMajor, minMinor, minPatch] = parse(minimumRequiredVersion)
    const [curMajor, curMinor, curPatch] = parse(currentClientVersion)

    if (curMajor < minMajor) return true
    if (curMajor > minMajor) return false

    if (curMinor < minMinor) return true
    if (curMinor > minMinor) return false

    return curPatch < minPatch
  }

  /*
  Lacking a SemVer version that supports 'coerce', here's a simple version that should handle our versioning schemes
  All valid versions will be returned as major.minor.patch with minor and patch defaulting to 0 if not provided

  Input: 'alpha'   Output: 'alpha'
  Input: 'a.1.3.4'   Output: 'a.1.3.4'
  Input: ''    Output: ''
  Input: undefined   Output: undefined
  Input: null   Output: null
  Input: '1.8.0-test.16'   Output: '1.8.0'
  Input: '1'   Output: '1.0.0'
  Input: '1.2'   Output: '1.2.0'
  Input: '1.2.3'   Output: '1.2.3'
  Input: '1.2.3.alpha'   Output: '1.2.3'
  Input: '1.2.3-alpha'   Output: '1.2.3'
  Input '1.2.3.4-alpha'   Output: '1.2.3'
  */
  static normalizeVersion(input) {
    // Rely on downstream logic to also have error checking
    if (!input) {
      return input
    }

    const version_parts = []

    const match = input.match(versionMatcher)
    if (match && match[1]) {
      // Major
      version_parts.push(match[1])

      // Minor
      if (match[2]) {
        version_parts.push(match[2])

        // Patch
        if (match[3]) {
          version_parts.push(match[3])
        } else {
          version_parts.push(0)
        }
      } else {
        version_parts.push(0)
        version_parts.push(0)
      }
    }

    // garbage in, garbage out
    return version_parts.length === 0 ? input : version_parts.join('.')
  }

}