let {ExportSection} = require('../streams/section')
let { assert } = require('chai')

describe('Section templates export', () => {
    it('should export template file with locale name if locale is array length 1', () => {
        let section = new ExportSection({
            type: 'email', 
            name: 'html', 
            object: 'template',
            localizations: [
                {
                    locale: ['en_US'], 
                    content: [
                        {
                          "data": "Content in en_US language",
                          "name": "html"
                        }
                      ]
                }
            ]
        }, 'template')

        section.extractTemplates()
        assert(section.templateFiles.length === 1)
        assert(section.templateFiles[0].name === 'template.email.html.en_US.html')
    })

    it('should export template file with name if locale is string', () => {
        let section = new ExportSection({
            type: 'email', 
            name: 'html', 
            object: 'template',
            localizations: [
                {
                    locale: 'en_US', 
                    content: [
                        {
                          "data": "Content in en_US language",
                          "name": "html"
                        }
                      ]
                }
            ]
        }, 'template')

        section.extractTemplates()
        assert(section.templateFiles.length === 1)
        assert(section.templateFiles[0].name === 'template.email.html.en_US.html')
    })

    it('should export template file with name hashed if locale is an array with multiple locales', () => {
        let section = new ExportSection({
            type: 'email', 
            name: 'html', 
            object: 'template',
            localizations: [
                {
                    locale: ['en_US', 'en_UK'], 
                    content: [
                        {
                          "data": "Content in multiple languages",
                          "name": "html"
                        }
                      ]
                }
            ]
        }, 'template')

        section.extractTemplates()
        assert(section.templateFiles.length === 1)
        assert(section.templateFiles[0].name === 'template.email.html.a60ac79e553bf2d10265482effc688c2.html')
    })

    it('should export template file with name anyLocale if locale is ["*"]', () => {
        let section = new ExportSection({
            type: 'email', 
            name: 'html', 
            object: 'template',
            localizations: [
                {
                    locale: ['*'], 
                    content: [
                        {
                          "data": "Content in multiple languages",
                          "name": "html"
                        }
                      ]
                }
            ]
        }, 'template')

        section.extractTemplates()
        assert(section.templateFiles.length === 1)
        assert(section.templateFiles[0].name === 'template.email.html.anyLocale.html')
    })
})
