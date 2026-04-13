import config from 'config'
import { trigger, on, log } from 'decorators'
import logger from 'logger'
import http from 'http'
import _ from 'lodash'

const getDomainParts = () => {
        return (/^api(.+?.)?\.medable\.(com|cn)$/i.exec(script.env.host))
      },
      getHost = (domainParts) => {
        return (domainParts[1] || '').replace('.', '-')
      },
      getTLD = (domainParts) => {
        return domainParts[2]
      },
      domainParts = getDomainParts(),
      host = getHost(domainParts),
      tld = getTLD(domainParts),
      // TODO: Dynamic host to be used when they are set  up
      // AXON_DEPLOYER_URL = `https://axon-deployer${getHost()}`,
      // AXON_DEPLOYER_URL = `http://0.0.0.0:49888`,
      AXON_DEPLOYER_URL = `https://axon-deployer${host}.medable.${tld}`,
      COMMON_OPTIONS = {
        headers: {
          'Content-Type': 'application/json'
        },
        strictSSL: false
      }
class TranslationManagement {

  version() {
    return config.get('tm__version')
  }

  static getTmAppKey() {
    return org.objects.org.find()
      .paths('apps')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next().apps.find(v => v.name === 'tm__app').clients[0].key
  }

  @log({ traceError: true })
  static callAxonService(path, method = 'get', body) {
    const call = http[method],
          tokens = config.get('tm__tokens'),
          params = method === 'get' ? _.merge(COMMON_OPTIONS, { headers: { Authorization: `Bearer ${tokens.services}` } })
            : {
              body,
              ..._.merge(COMMON_OPTIONS, { headers: { Authorization: `Bearer ${tokens.services}` } })
            },
          response = call(`${AXON_DEPLOYER_URL}/${path}`, params)
    return response && response.body && JSON.parse(response.body)
  }

  @log({ traceError: true })
  @trigger('create.before', {
    object: 'tm__job',
    weight: 1
  })
  static setDefaultStatus({ new: job }) {
    // import jobs default to created so that users can attach an import file
    // before running the job.  Export jobs do not require a file to be
    // attached, they default to pending so they are immediately added to queue.
    // Note: use default value expressions when CTXAPI-953 is fixed.
    if (job.type === 'tm__export') {
      job.update('tm__status', 'queued')
    }
  }

  @log({ traceError: true })
  @trigger('update.after', 'create.after', {
    object: 'tm__job',
    if: {
      $and: [
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'tm__status'
            ]
          }, 0]
        },
        {
          $eq: [
            '$$ROOT.tm__status',
            'queued'
          ]
        }
      ]
    },
    weight: 1
  })
  static submitJobWhenQueued({ new: job, old: oldJob }) {
    const { headers } = require('request')
    const jobInfo = { ...oldJob, ...job }
    const zipFiles = config.get('tm__version').version >= '1.1.0'

    const sourceToken = org.objects.account.createAuthToken(
      this.getTmAppKey(),
      'tm__service',
      {
        scope: ['*'],
        permanent: false,
        includeEmail: true
      }
    )
    logger.debug({ host })
    const jobDescription = {
      sourceToken,
      axonComponents: jobInfo.tm__axon_components,
      direction: job.type === 'tm__export' ? 'export' : 'import',
      newStringsOnly: jobInfo.tm__new_strings_only,
      languages: jobInfo.tm__languages,
      production: !host || ['eu1', 'cn1'].includes(host.replace(/\.|-/g, '')),
      zipFiles,
      selectedAssessments: jobInfo.tm__selected_assessments,
      includeNonAssessments: jobInfo.tm__include_non_assessments
    }

    if (jobDescription.direction === 'export') {

      const payload = { tm__export_file: { content: `${jobInfo.tm__name}.${zipFiles ? 'zip' : 'json'}` } }
      const jobUpload = org.objects.tm__jobs.updateOne({ _id: job._id }, { $set: payload })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .lean(false)
        .execute()

      jobDescription.uploadInfo = jobUpload.tm__export_file.uploads[0]
    } else if (jobDescription.direction === 'import') {

      const jobUpload = org.objects.tm__jobs.find({ _id: job._id })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .paths('tm__import_file')
        .next()

      jobDescription.importFileURL = jobUpload.tm__import_file
      jobDescription.errorsUploadInfo = this.uploadErrors(job._id, jobInfo.tm__name)

    }

    let res = this.callAxonService(`translate`, 'post', JSON.stringify(jobDescription))
    console.log(res)

    script.fire('tm__job_start', { _id: job._id, uuid: res.data })
  }

  @log({ traceError: true })
  @trigger('file.process.after', { object: 'tm__job' })
  static onFileProcessed({ context, params }) {

    const job = org.objects.tm__jobs.find({ _id: context._id })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next()

    if (job.tm__status === 'created' && job.type === 'tm__import') {
      org.objects.tm__jobs.updateOne({ _id: context._id }, { $set: { tm__status: 'queued' } })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }
  }

  // Placeholder: queued jobs start running after 5 seconds.
  @log({ traceError: true })
  @on('tm__job_start')
  static startJob({ _id, uuid }) {
    org.objects.tm__jobs.updateOne(_id, {
      $set: {
        tm__status: 'running'
      }
    })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()

    org.objects.events.insertOne({
      type: 'script',
      event: 'tm__job_update',
      start: Date.now() + 3 * 1000,
      param: {
        _id,
        uuid
      }
    })
      .bypassCreateAcl()
      .grant(consts.accessLevels.script)
      .execute()
  }

  @on('tm__job_update')
  static updateJob({ _id, uuid }) {

    const operationStatus = this.callAxonService(`status/${uuid}`)
    console.log(operationStatus)

    if (!operationStatus.stopped) {
      org.objects.events.insertOne({
        type: 'script',
        event: 'tm__job_update',
        start: Date.now() + 3 * 1000,
        param: {
          _id,
          uuid
        }
      })
        .bypassCreateAcl()
        .grant(consts.accessLevels.script)
        .execute()

    } else {
      script.fire('tm__job_end', { _id, uuid })
    }
  }

  @on('tm__job_end')
  static endJob({ _id, uuid }) {
    const operationStatus = this.callAxonService(`status/${uuid}`),
          tm__status = this.getJobStatus(operationStatus),
          update = {
            tm__status
          }

    if (operationStatus.cancelled && operationStatus.err) {
      update.tm__failure_reason = JSON.stringify(operationStatus.err)
    }

    org.objects.tm__jobs.updateOne(_id, {
      $set: update
    })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()
  }

  static getJobStatus({ cancelled, phase }) {
    if (phase === 'Incomplete') {
      return 'incomplete'
    } else if (!cancelled) {
      return 'completed'
    }
    return 'failed'
  }

  static uploadErrors(_id, jobName) {
    const payload = { tm__error_file: { content: `${jobName}.log` } }
    const errorsUpload = org.objects.tm__jobs.updateOne({ _id }, { $set: payload })
      .lean(false)
      .execute()

    return errorsUpload.tm__error_file.uploads[0]
  }

}

module.exports = TranslationManagement