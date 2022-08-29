const Transform = require('../../packageScripts/ingestTransform.js')
let transform, consts

jest.mock('runtime.transform', () => ({ Transform: class { } }), { virtual: true })
jest.mock('config', () => { }, { virtual: true })

describe('econsentDocumentTemplateAdjustments', () => {

  beforeAll(() => {
    transform = new Transform()
    global.consts = { accessLevels: { read: 'read' } }
    global.org = {
      objects: {
        ec__document_template: {
          readOne: () => ({
            skipAcl: () => ({
              grant: () => ({
                throwNotFound: () => ({
                  paths: () => ({
                    execute: () => { }
                  })
                })
              })
            })
          })
        }
      }
    }
  })

  it('should not delete sites from ec__sites present in the manifest', () => {
    const resource = { object: 'ec__document_template', ec__status: 'draft', ec__sites: ['c_site.abc'] },
      memo = { availableApps: { eConsentConfig: '1.0' }, manifest: { c_site: { includes: ['abc'] } } }

    global.org.objects.c_sites = {
      find: () => ({
        skipAcl: () => ({
          grant: () => ({
            hasNext: () => false
          })
        })
      })
    }

    transform.each(resource, memo)

    expect(resource.ec__sites)
      .toStrictEqual(['c_site.abc'])
  })

  it('should not delete sites from ec__sites present in the org', () => {
    const resource = { object: 'ec__document_template', ec__status: 'draft', ec__sites: ['c_site.abc'] },
      memo = { availableApps: { eConsentConfig: '1.0' }, manifest: {} }

    global.org.objects.c_sites = {
      find: () => ({
        skipAcl: () => ({
          grant: () => ({
            hasNext: () => true
          })
        })
      })
    }

    transform.each(resource, memo)

    expect(resource.ec__sites)
      .toStrictEqual(['c_site.abc'])
  })

  it('should delete sites from ec__sites not present in the manifest or the org', () => {
    // manifest includes site abc, org includes site def, so should remove site ghi
    const resource = { object: 'ec__document_template', ec__status: 'draft', ec__sites: ['c_site.abc', 'c_site.def', 'c_site.ghi'] },
      memo = { availableApps: { eConsentConfig: '1.0' }, manifest: { c_site: { includes: ['abc'] } } }

    global.org.objects.c_sites = {
      find: ({ c_key }) => {
        if (c_key === 'def') {
          return {
            skipAcl: () => ({
              grant: () => ({
                hasNext: () => true
              })
            })
          }
        }
        else {
          return {
            skipAcl: () => ({
              grant: () => ({
                hasNext: () => false
              })
            })
          }
        }
      }
    }

    transform.each(resource, memo)

    expect(resource.ec__sites)
      .toStrictEqual(['c_site.abc', 'c_site.def'])
  })

})
