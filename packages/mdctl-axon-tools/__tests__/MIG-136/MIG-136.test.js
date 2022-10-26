/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-tabs */
const { Org } = require('@medable/mdctl-api-driver/lib/cortex.object'),
      { pick } = require('lodash'),
      StudyManifestTools = require('../../lib/StudyManifestTools'),
      existingStudy = [{
        _id: '1',
        c_name: 'Study',
        c_key: 'abc'
      }],
      existingTasks = [{
        _id: '1',
        c_name: 'Task 1',
        c_study: '1',
        c_key: '123-456-789'
      },
      {
        _id: '2',
        c_name: 'Task 2',
        c_study: '1',
        ec__key: '234-567-890'
      },
      {
        _id: '3',
        c_name: 'Task 3',
        c_study: '2',
        ec__key: '345-678-901'
      }],
      existingConsent = [{
        _id: '1',
        ec__status: 'draft',
        ec__title: 'title',
        ec__identifier: 'Test Template 1',
        ec__study: '2',
        ec__key: '456-789-012'
      },
      {
        _id: '2',
        ec__status: 'draft',
        ec__title: 'title',
        ec__identifier: 'Test Template 2',
        ec__study: '1',
        ec__key: '567-890-123'
      }],

      org = {
        objects: {
          c_study: {
            find: () => ({
              paths: () => ({
                toArray: () => existingStudy
              })
            })
          },
          c_tasks: {
            find: study => ({
              limit: () => ({
                paths: (...props) => ({
                  toArray: () => {
                    const result = existingTasks.filter(t => t.c_study === study.c_study),
                          res = result ? result.map(item => Object.assign(
                            ...props.map(prop => ({ [prop]: item[prop] }))
                          )) : []
                    return res
                  }
                })
              })
            })
          },
          ec__document_templates: {
            find: study => ({
              limit: () => ({
                paths: (...props) => ({
                  toArray: () => {
                    const result = existingConsent.filter(e => e.ec__study === study.ec__study),
                          res = result ? result.map(item => Object.assign(
                            ...props.map(prop => ({ [prop]: item[prop] }))
                          )) : []
                    return res
                  }
                })
              })
            })
          }
        }
      }

jest.mock('@medable/mdctl-api-driver/lib/cortex.object')
jest.spyOn(Org.prototype, 'constructor').mockImplementation(() => org)

describe('MIG-136 - Orphan records', () => {

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Should returns only existing study Assignments', async() => {
    const studyManifestTools = new StudyManifestTools(),
          tasks = await studyManifestTools.getTasks(),
          test = existingTasks.filter(t => t.c_study === existingStudy[0]._id)
            .map(t => pick(t, ['c_name']))

    expect(tasks).toStrictEqual(test)
  })

  it('Should returns no Assignments if study does not exists', async() => {
    // Overwrite function to return an empty array
    org.objects.c_study.find = () => ({ paths: () => ({ toArray: () => [] }) })
    const studyManifestTools = new StudyManifestTools(),
          tasks = await studyManifestTools.getTasks()

    expect(tasks).toStrictEqual([])

    // Restoring function to its previous value
    org.objects.c_study.find = () => ({ paths: () => ({ toArray: () => existingStudy }) })
  })

  it('Should returns only existing study eTemplates', async() => {
    const studyManifestTools = new StudyManifestTools(),
          templates = await studyManifestTools.getConsentTemplates(),
          test = pick(existingConsent[1], ['ec__identifier', 'ec__title'])

    expect(templates[0]).toStrictEqual(test)

  })

  it('Should returns no eTemplates if study does not exists', async() => {
    // Overwrite function to return an empty array
    org.objects.c_study.find = () => ({ paths: () => ({ toArray: () => [] }) })
    const studyManifestTools = new StudyManifestTools(),
          templates = await studyManifestTools.getConsentTemplates()

    expect(templates).toStrictEqual([])

    // Restoring function to its previous value
    org.objects.c_study.find = () => ({ paths: () => ({ toArray: () => existingStudy }) })
  })

})
