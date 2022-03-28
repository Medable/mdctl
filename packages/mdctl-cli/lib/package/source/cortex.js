const { URL } = require('url'),
      FormData = require('form-data')

class Cortex {

  constructor(name, version, options) {
    this.name = name
    this.version = version
    this.client = options.client
    this.publishPath = process.env.PACKAGE_PUBLISH_PATH || '/developer/packages/publish'
    this.installPath = process.env.PACKAGE_INSTALL_PATH || '/developer/packages/install'
  }

  async installPackage(pkg) {
    const url = new URL(this.installPath, this.client.environment.url),
          dependencies = pkg.dependenciesPackages || [],
          install = (body) => this.client.call(url.pathname, { method: 'POST', body })

    dependencies.forEach(async(dependency) => {
      try {
        await install(await dependency.getPackageStream())
      } catch (err) {
        throw new Error('Failed to install one of the package dependencies. Please try it again!!!')
      }
    })

    await install(await pkg.getPackageStream())
  }

  async publishPackage(zipStream) {
    // Publishing a package to cortex has 2 phases
    // 1. Create a facet
    // 2. Upload the package
    const url = new URL(this.publishPath, this.client.environment.url),
          filename = `${this.name}_${this.version}.zip`,
          facet = await this.client.call(url.pathname, {
            method: 'PUT',
            body: {
              content: filename
            }
          }),
          upload = facet.uploads[0],
          {
            uploadUrl, uploadKey, fields
          } = upload,
          form = new FormData(),
          zipToBuffer = () => new Promise((resolve, reject) => {
            const data = []

            zipStream.on('data', (chunk) => {
              data.push(chunk)
            })

            zipStream.on('end', () => {
              resolve(Buffer.concat(data))
            })

            zipStream.on('error', (error) => {
              reject(error)
            })
          }),
          data = await zipToBuffer()

    fields.forEach((field) => {
      const { key, value } = field
      form.append(key, value)
    })

    form.append(
      uploadKey,
      data,
      {
        filename
      }
    )

    await new Promise((resolve, reject) => {
      form.submit(uploadUrl, (err, response) => {
        if (err) {
          console.error(err)
          reject(err)
        } else if ([200, 201].includes(response.statusCode)) {
          console.log(`Successfully published package ${this.name}@${this.version} to cortex`)
          resolve()
        } else {
          console.error(`Publishing package failed with status code ${response.statusCode} and status message ${response.statusMessage}`)
          reject()
        }
      })
    })
  }

}

module.exports = Cortex
