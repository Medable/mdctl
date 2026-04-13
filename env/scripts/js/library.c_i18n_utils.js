const { route, log, as } = require('decorators')

class I18nUtils {

  /**
   * @openapi
   * /routes/translations/hash/{locale}/{namespace}:
   *  get:
   *    description: 'I18n bundle hashes'
   *    parameters:
   *      - name: locale
   *        in: path
   *        required: true
   *        description: locale to use to find bundle
   *        schema:
   *          type: string
   *      - name: namespace
   *        in: path
   *        required: false
   *        description: namespace of bundle
   *        schema:
   *          type: string
   *
   *    responses:
   *      '200':
   *        description: partial i18nbundle object
   *        content:
   *          application/json:
   *            schema:
   *              schema:
   *              type: object
   *              properties:
   *                hash:
   *                  type: string
   *                namespace:
   *                  type: string
   *                object:
   *                  type: string
   *                _id:
   *                  type: string
   */
  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'c_i18n_translation_hash',
    path: 'translations/hash/:locale/:namespace?',
    acl: ['account.anonymous']
  })
  static getI18nBunldeHash({ req }) {
    const { locale, namespace } = req.params

    const where = {
      locale,
      ...(namespace ? { namespace } : {})
    }

    const hashes = org.objects.i18nbundles
      .find(where)
      .paths('hash', 'namespace')
      .skipAcl()
      .grant(4)
      .toArray()

    return hashes
  }

}

module.exports = I18nUtils