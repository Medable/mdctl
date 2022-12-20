const { assert } = require('chai'),
      { ExportSection } = require('../streams/section')

describe('Section templates export', () => {

  it('should export template file with locale name if locale is an array of length = 1', () => {
    const section = new ExportSection({
      type: 'email',
      name: 'email_template_array_locale_length_one',
      object: 'template',
      localizations: [{
        locale: ['en_US'],
        content: [{
          data: 'HTML Content in en_US language',
          name: 'html'
        }, {
          data: 'Plain content in en_US language',
          name: 'plain'
        }, {
          data: 'Subject in en_US language',
          name: 'subject'
        }]
      }]
    }, 'template')

    section.extractTemplates()
    assert(section.templateFiles.length === 3)
    assert.deepInclude(section.templateFiles[0], {
      name: 'template.email.email_template_array_locale_length_one.en_US.html',
      ext: 'html',
      data: 'HTML Content in en_US language',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[0].data'
    })

    assert.deepInclude(section.templateFiles[1], {
      name: 'template.email.email_template_array_locale_length_one.en_US.plain',
      ext: 'txt',
      data: 'Plain content in en_US language',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[1].data'
    })

    assert.deepInclude(section.templateFiles[2], {
      name: 'template.email.email_template_array_locale_length_one.en_US.subject',
      ext: 'txt',
      data: 'Subject in en_US language',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[2].data'
    })
  })

  it('should export SMS template file with locale name if locale is an array of length is 1', () => {
    const section = new ExportSection({
      type: 'sms',
      name: 'sms_template_locale_array_length_one',
      object: 'template',
      localizations: [{
        locale: ['en_CA'],
        content: [{
          data: 'SMS Content in en_CA language',
          name: 'message'
        }]
      }]
    }, 'template')

    section.extractTemplates()
    assert(section.templateFiles.length === 1)
    assert.deepInclude(section.templateFiles[0], {
      name: 'template.sms.sms_template_locale_array_length_one.en_CA.message',
      ext: 'txt',
      data: 'SMS Content in en_CA language',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[0].data'
    })

  })

  it('should export template file with name if locale is string', () => {
    const section = new ExportSection({
      type: 'email',
      name: 'email_locale_plain_string',
      object: 'template',
      localizations: [{
        locale: 'es_AR',
        content: [{
          data: 'Contenido HTML en español de Argentina',
          name: 'html'
        }, {
          data: 'Contenido plano en español de Argentina',
          name: 'plain'
        }, {
          data: 'Asunto en español de Argentina',
          name: 'subject'
        }]
      }]
    }, 'template')

    section.extractTemplates()
    assert.equal(section.templateFiles.length, 3)
    assert.deepInclude(section.templateFiles[0], {
      name: 'template.email.email_locale_plain_string.es_AR.html',
      ext: 'html',
      data: 'Contenido HTML en español de Argentina',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[0].data'
    })
    assert.deepInclude(section.templateFiles[1], {
      name: 'template.email.email_locale_plain_string.es_AR.plain',
      ext: 'txt',
      data: 'Contenido plano en español de Argentina',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[1].data'
    })
    assert.deepInclude(section.templateFiles[2], {
      name: 'template.email.email_locale_plain_string.es_AR.subject',
      ext: 'txt',
      data: 'Asunto en español de Argentina',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[2].data'
    })
  })

  it('should export template file with name hashed if locale is an array with multiple locales', () => {
    const section = new ExportSection({
      type: 'email',
      name: 'email_template_two_locales',
      object: 'template',
      localizations: [{
        locale: ['en_US', 'en_UK'],
        content: [{
          data: 'HTML Content in multiple languages',
          name: 'html'
        }, {
          data: 'Plain Content in multiple languages',
          name: 'plain'
        }, {
          data: 'Subject in multiple languages',
          name: 'subject'
        }]
      }]
    }, 'template')

    section.extractTemplates()
    assert.equal(section.templateFiles.length, 3)
    assert.deepInclude(section.templateFiles[0], {
      name: 'template.email.email_template_two_locales.a60ac79e553bf2d10265482effc688c2.html',
      ext: 'html',
      data: 'HTML Content in multiple languages',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[0].data'
    })
    assert.deepInclude(section.templateFiles[1], {
      name: 'template.email.email_template_two_locales.a60ac79e553bf2d10265482effc688c2.plain',
      ext: 'txt',
      data: 'Plain Content in multiple languages',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[1].data'
    })
    assert.deepInclude(section.templateFiles[2], {
      name: 'template.email.email_template_two_locales.a60ac79e553bf2d10265482effc688c2.subject',
      ext: 'txt',
      data: 'Subject in multiple languages',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[2].data'
    })
  })

  it('should export SMS template file with name hashed if locale is an array with multiple locales', () => {
    const section = new ExportSection({
      type: 'sms',
      name: 'sms_template_two_locales',
      object: 'template',
      localizations: [{
        locale: ['en_GB', 'en_CA'],
        content: [{
          data: 'SMS message for en_GB and en_CA',
          name: 'message'
        }]
      }]
    }, 'template')

    section.extractTemplates()
    assert.equal(section.templateFiles.length, 1)
    assert.deepInclude(section.templateFiles[0], {
      name: 'template.sms.sms_template_two_locales.311ac520149e89eeed8d3e3c767a0c4b.message',
      ext: 'txt',
      data: 'SMS message for en_GB and en_CA',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[0].data'
    })
  })

  it('should export template file with name anyLocale if locale is [\'*\']', () => {
    const section = new ExportSection({
      type: 'email',
      name: 'email_anyLocale',
      object: 'template',
      localizations: [{
        locale: ['*'],
        content: [{
          data: 'HTML Content for any locale',
          name: 'html'
        }, {
          data: 'Plain Content for any locale',
          name: 'plain'
        }, {
          data: 'Subject for any locale',
          name: 'subject'
        }]
      }]
    }, 'template')

    section.extractTemplates()
    assert.equal(section.templateFiles.length, 3)
    assert.deepInclude(section.templateFiles[0], {
      name: 'template.email.email_anyLocale.anyLocale.html',
      ext: 'html',
      data: 'HTML Content for any locale',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[0].data'
    })
    assert.deepInclude(section.templateFiles[1], {
      name: 'template.email.email_anyLocale.anyLocale.plain',
      ext: 'txt',
      data: 'Plain Content for any locale',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[1].data'
    })
    assert.deepInclude(section.templateFiles[2], {
      name: 'template.email.email_anyLocale.anyLocale.subject',
      ext: 'txt',
      data: 'Subject for any locale',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[2].data'
    })
  })

  it('should export SMS template file with name anyLocale if locale is [\'*\']', () => {
    const section = new ExportSection({
      type: 'sms',
      name: 'sms_anyLocale',
      object: 'template',
      localizations: [{
        locale: ['*'],
        content: [{
          data: 'SMS message for any locale',
          name: 'message'
        }]
      }]
    }, 'template')

    section.extractTemplates()
    assert.equal(section.templateFiles.length, 1)
    assert.deepInclude(section.templateFiles[0], {
      name: 'template.sms.sms_anyLocale.anyLocale.message',
      ext: 'txt',
      data: 'SMS message for any locale',
      remoteLocation: false,
      pathTo: '$.localizations[0].content[0].data'
    })
  })
})
