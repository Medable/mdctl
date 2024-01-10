/* eslint-disable camelcase */
const globby = require('globby'),
      path = require('path'),
      fs = require('fs'),
      _ = require('lodash'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { Driver } = require('@medable/mdctl-api-driver'),
      { Org } = require('@medable/mdctl-api-driver/lib/cortex.object'),
      { Fault } = require('@medable/mdctl-core')

class StudyDataTranslations {

  constructor(client, options = {}) {
    Object.assign(privatesAccessor(this), {
      client,
      options
    })
  }

  getOrg() {
    const { client } = privatesAccessor(this),
          driver = new Driver(client),
          org = new Org(driver)

    return org
  }

  isAuthTaskTranslations({ input = process.cwd(), manifest }) {
    let manifestData = manifest
    if (!manifestData) {
      const location = globby.sync(['manifest.{json,yaml}'], { cwd: input })
      if (location.length > 0 && fs.existsSync(`${input}/${location[0]}`)) {
        manifestData = JSON.parse(fs.readFileSync(`${input}/${location[0]}`))
      }
    }

    if (!manifestData) {
      throw Fault.create('mdctl.kManifestNotFound.error', { reason: 'There is no manifest set as a parameter, nor is one found in the directory."' })
    }

    if (manifestData.authenticationTaskTranslations && !_.has(manifestData, 'i18ns')) {
      throw Fault.create('mdctl.kInvalidArgument.missingI18nObjects', {
        message: 'The manifest is missing "i18ns" objects',
        reason: 'Incase of using "authenticationTaskTranslations" option. The manifest file must include "i18ns" objects.'
      })
    }

    return manifestData.authenticationTaskTranslations
  }

  async writeAuthTaskTranslationsToDisk({ input = process.cwd(), format = 'json' }) {
    const location = globby.sync(['i18ns/**/*.{json,yaml}'], { cwd: input }),
          tasks = await this.readAuthenticationTasks(),
          keys = _.concat(
            tasks.map(({ c_key, object, _id }) => ({ c_key, object, _id })),
            _.flatMap(
              tasks.filter(({ c_steps }) => Boolean(c_steps)),
              ({ c_steps: { data } }) => data
            )
          ),
          parentSteps = keys.filter(({ c_parent_step }) => c_parent_step)
            .map(({ c_parent_step: { _id } }) => _id)

    if (!location.length) return

    if (!fs.existsSync(
      path.join(input, 'env/i18ns/authTasks')
    )) {
      fs.mkdirSync(path.join(input, 'env/i18ns/authTasks'), { recursive: true })
    }

    location.forEach((l) => {
      const lang = path.basename(l, `.${format}`),
            data = JSON.parse(fs.readFileSync(`${input}/${l}`))

      this.addTaskStepNameTranslations({
        lang, translations: data, input, keys, parentSteps
      })
    })

  }

  async readAuthenticationTasks() {
    const org = this.getOrg(),
          tasks = await org.objects.c_tasks.find({ c_type: 'authentication' }).limit(false).paths(
            'c_key',
            'c_steps._id',
            'c_steps.c_parent_step',
            'c_steps.c_key',
            'c_steps.c_account_map'
          ).toArray()

    return tasks
  }

  addTaskStepNameTranslations({
    lang, translations, input, keys, parentSteps
  }) {
    const locale = lang.replace(/-/g, '_'),
          content = {
            locale,
            name: `axon__${locale}_authTasks`,
            namespace: 'axon',
            object: 'i18n',
            tags: ['authTasks'],
            weight: 0,
            data: {}
          }

    keys.forEach(({
      object, c_key, c_account_map, _id
    }) => {
      let data
      if (object === 'c_task') {
        data = {
          c_task: {
            [c_key]: {
              c_name: translations.task
            }
          }
        }
      } else if (c_account_map || parentSteps.includes(_id)) {
        data = {
          c_step: {
            [c_key]: {
              c_text: parentSteps.includes(_id) ? translations.parent : translations[c_account_map]
            }
          }
        }
      }
      _.merge(
        content,
        {
          data
        }
      )
    })

    fs.writeFileSync(
      path.join(input, `env/i18ns/authTasks/axon_data_${lang}.json`),
      JSON.stringify(content, null, 2)
    )
  }

}

module.exports = StudyDataTranslations
