/* eslint-disable no-unused-expressions */
/* eslint-disable import/order */

const { expect } = require('chai'),
      path = require('path'),
      fs = require('fs'),
      StudyDataTranslations = require('../../lib/StudyDataTranslations'),
      mockTasks = [
        {
          c_key: 'taskKey',
          _id: 'taskId',
          object: 'c_task',
          c_steps: {
            object: 'list',
            data: [
              {
                _id: 'stepId',
                c_parent_step: {
                  _id: 'parentStepId',
                  object: 'c_step',
                  path: '/c_steps/parentStepId'
                },
                c_key: 'stepKey',
                c_account_map: 'name.first',
                object: 'c_step'
              }
            ]
          }
        }
      ],
      org = {
        objects: {
          c_tasks: {
            find: () => ({
              limit: () => ({
                paths: () => ({
                  toArray: () => mockTasks
                })
              })
            })
          }
        }
      }

describe('MIG-166', () => {
  let studyTranslations

  beforeAll(() => {
    studyTranslations = new StudyDataTranslations({})
  })

  it('can read the new manifest option "authenticationTaskTranslations".', () => {
    const studyDataTranslations = studyTranslations.isAuthTaskTranslations({
      manifest: {
        object: 'manifest',
        i18ns: {
          includes: ['*']
        },
        authenticationTaskTranslations: true
      }
    })

    // eslint-disable-next-line no-unused-expressions
    expect(studyDataTranslations)
      .to.be.true
  })

  it('should throw an error if the manifest file is missing "i18ns".', () => {
    let err
    try {
      studyTranslations.isAuthTaskTranslations({
        manifest: {
          object: 'manifest',
          authenticationTaskTranslations: true
        }
      })
    } catch (error) {
      err = error
    }

    expect(err.errCode)
      .to.equal('mdctl.kInvalidArgument.missingI18nObjects')
  })

  it('should write the required i18n files.', async() => {
    jest.spyOn(StudyDataTranslations.prototype, 'getOrg').mockImplementation(() => org)

    await studyTranslations.writeAuthTaskTranslationsToDisk(
      { input: __dirname }
    )

    const output = path.join(__dirname, './env/i18ns/authTasks/axon_data_af-ZA.json'),
          data = JSON.parse(fs.readFileSync(output))

    expect(fs.existsSync(output))
      .to.be.true

    expect(data)
      .to.deep.equal({
        locale: 'af_ZA',
        name: 'axon__af_ZA_authTasks',
        namespace: 'axon',
        object: 'i18n',
        tags: [
          'authTasks'
        ],
        weight: 0,
        data: {
          c_task: {
            taskKey: {
              c_name: 'Waarmerking'
            }
          },
          c_step: {
            stepKey: {
              c_text: 'Voornaam'
            }
          }
        }
      })
  })
})
