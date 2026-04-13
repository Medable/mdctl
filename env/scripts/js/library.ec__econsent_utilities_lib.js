/***********************************************************

 @script     eConsent - eConsent Utilities Library

 @brief      Desc

 @author     Fiachra Matthews

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import counters from 'counters'
import config from 'config'
import logger from 'logger'
import _ from 'underscore'
import { get } from 'lodash'
import base64 from 'base64'
import faults from 'c_fault_lib'

const NewSiteAccountRoles = [
  'Axon Site User',
  'Axon Site Monitor',
  'Axon Site Investigator'
]

const {
  c_studies
} = org.objects
const { accessLevels, roles } = consts

class EconsentUtilities {

  static templateCounterStr = 'template-id'
  static signedDocCounterStr = 'signed-doc-id'

  static fillPlaceholder(formatSpec, num) {
    const placeHolderLen = (formatSpec.match(/#/g) || []).length
    const numString = num.toString()

    const placeHolder = ''.padStart(placeHolderLen, '#')
    return formatSpec.replace(placeHolder, numString.padStart(placeHolderLen, '0'))
  }

  static getNextID(counterID, formatSpec) {
    let counterVal = counters.next(counterID)
    const object = counterID.includes(this.templateCounterStr)
      ? org.objects.ec__document_template
      : org.objects.ec__signed_document

    const count = object.find()
      .count()

    while (counterVal <= count) {
      counterVal = counters.next(counterID)
    }

    let identifier = this.fillPlaceholder(formatSpec, counterVal)
    let iterations = 0
    const maxIterations = 5000

    while (iterations <= maxIterations && object.find({ ec__identifier: identifier })
      .hasNext()) {
      counterVal = counters.next(counterID)
      identifier = this.fillPlaceholder(formatSpec, counterVal)
      iterations++
    }

    return identifier
  }

  static getNextTemplateID() {
    const study = c_studies.find()
      .skipAcl()
      .grant(accessLevels.read)
      .next()
    const counterID = `${this.templateCounterStr}-${study._id}`
    const formatSpec = (study.ec__econsent_format_spec && study.ec__econsent_format_spec.c_template) || '######'

    return this.getNextID(counterID, formatSpec)
  }

  static getNextSignedDocID() {
    const study = c_studies.find()
      .skipAcl()
      .grant(accessLevels.read)
      .next()
    const counterID = `${this.signedDocCounterStr}-${study._id}`
    const formatSpec = (study.ec__econsent_format_spec && study.ec__econsent_format_spec.c_signed_doc) || '######'

    return this.getNextID(counterID, formatSpec)
  }

  static generateRandomDigitSequence(length) {
    const lower = Math.pow(10, length - 1),
          max = Math.pow(10, length) - lower

    return (Math.floor(Math.random() * max) + lower).toString()
  }

  /**
   * Generates a deterministic dummy email for PTS participants when real email is unavailable.
   * Uses the .invalid TLD to ensure the email is non-deliverable per RFC 2606.
   * @param {string} publicUserId - The c_public_user _id
   * @returns {string} Dummy email in format pts+<publicUserId>@econsent.invalid
   */
  static generatePtsDummyEmail(publicUserId) {
    return `pts+${publicUserId}@econsent.invalid`
  }

  /**
   * Checks if an email is a PTS dummy email (non-deliverable placeholder).
   * @param {string} email - The email to check
   * @returns {boolean} True if the email is a dummy email
   */
  static isPtsDummyEmail(email) {
    return email && email.endsWith('@econsent.invalid')
  }

  static generateRandomAlphabeticalSequence(codeLength) {
    const allowedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let code = ''
    for (let i = codeLength; i > 0; i--) {
      code += allowedChars[Math.floor(Math.random() * allowedChars.length)]
    }
    return code
  }

  static arrayHasDuplicates(arr) {
    return new Set(arr).size !== arr.length
  }

  static getAppKey() {
    const apps = org.objects.org.find()
            .paths('apps')
            .skipAcl()
            .grant(accessLevels.read)
            .next().apps,
          sessionApps = apps.filter(app => app.clients[0].sessions && app.clients[0].enabled)

    return (sessionApps.length && sessionApps[0].clients[0].key) || ''
  }

  /* eslint-disable-next-line */
  static hasRole = (rlist, role) => rlist.find(x => x == `${roles[role]}`)

  static getAppInfo(template, currentEnv, currentRole) {
    let appConfig = config.get('app_config')
    if (!appConfig) {
      appConfig = {
        consentUsesPatientApp: true
      }
      config.set('app_config', appConfig)
    }
    const appConfigInfo = config.get('ec__app_config')
    let appUrl = appConfigInfo.signeeAppUrls.find(v => v.env === currentEnv).url
    let documentPath = appConfigInfo.signeeAppDocumentPath

    if (appConfig.consentUsesPatientApp) {
      const role = template.ec__signer_roles.find(v => v.ec__role === currentRole)
      if (role.ec__signer_type === 'participant') {
        appUrl = appConfigInfo.patientAppUrls.find(v => v.env === currentEnv).url
        documentPath = appConfigInfo.patientAppDocumentPath
      } else if (role.ec__signer_type === 'internal signer') {
        const study = c_studies.find()
          .skipAcl()
          .grant(accessLevels.read)
          .next()
        appUrl = study.c_requires_econsent_field ? appConfigInfo.siteAppUrls.find(v => v.env === currentEnv).url : appConfigInfo.signeeAppUrls.find(v => v.env === currentEnv).url
        documentPath = appConfigInfo.siteAppDocumentPath
      }
    }

    return {
      appUrl,
      documentPath
    }

  }

  static encodeBase64Url(data) {
    const base64Encoded = base64.encode(data)
    return this.convertToBase64Url(base64Encoded)
  }

  static decodeBase64Url(data) {
    const base64Data = this.convertFromBase64Url(data)
    return base64.decode(base64Data)
  }

  static convertFromBase64Url(data) {
    let base64Encoded = data
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    if (base64Encoded.length % 4 !== 0) {
      const count = 4 - base64Encoded.length % 4
      let padding = ''
      for (let i = 0; i < count; i++) {
        padding = `${padding}=`
      }
      base64Encoded = `${base64Encoded}${padding}`
    }
    return base64Encoded
  }

  static convertToBase64Url(base64Encoded) {
    return base64Encoded
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .slice(0, base64Encoded.indexOf('=') === -1 ? base64Encoded.length : base64Encoded.indexOf('='))
  }

  static removeDuplicateSpaces(str) {
    return str && str.replace(/ +/g, ' ')
  }

  static getDocumentPreview({ ec__document_template }) {
    return {
      access: 6,
      accessRoles: ec__document_template.accessRoles,
      created: ec__document_template.created,
      creator: ec__document_template.creator,
      ec__accepted_signers: [],
      ec__applied_signers: 1,
      ec__completion_time: '',
      ec__custom_data: [],
      ec__document_template,
      ec__final_document: {},
      ec__identifier: ec__document_template.ec__identifier,
      ec__primary_participant: {},
      ec__pts: ec__document_template.ec__pts_only,
      ec__pts_document_uploaded: false,
      ec__required_data: { object: 'list', data: [], hasMore: false },
      ec__required_signers: 1,
      ec__signature_invites: { object: 'list', data: [], hasMore: false },
      ec__signatures: { object: 'list', data: [] },
      ec__site: { _id: ec__document_template.ec__sites[0], data: [] },
      ec__status: ec__document_template.ec__status,
      ec__study: ec__document_template.ec__study,
      favorite: false,
      object: 'ec__signed_document',
      owner: ec__document_template.owner,
      shared: true,
      updated: ec__document_template.updated,
      updater: ec__document_template.updater,
      _id: ec__document_template._id
    }
  }

  static constructSiteLinkedFields(site, ec__language) {
    const linkedFields = {}
    const ec__linked_fields = config.get('ec__linked_fields_config')
    ec__linked_fields.forEach(prop => {
      let value = get(site, prop.ec__key, '')

      if (value.length === 0) {
        value = ''
      } else if (prop.ec__key === 'c_contacts' && value.length) {
        let c_24hours = '',
            c_daytime = ''

        value.forEach(contact => {
          if (contact.c_type === 2 && contact.c_contact.length && !c_24hours) {
            c_24hours = contact.c_contact // 24 Hours: Contact 2
          } else if (contact.c_type === 1 && contact.c_contact.length && !c_daytime) {
            c_daytime = contact.c_contact
          }
        })

        if (prop.ec__placeholder === 'site_phonenumber_24hour') {
          value = c_24hours
        } else {
          value = c_daytime
        }
      } else if (prop.ec__placeholder === 'site_address_country') {
        const lang = (ec__language || 'en').split('_')[0]
        if (['en', 'es'].includes(lang)) value = countryNames[lang][value]
      }
      linkedFields[prop.ec__placeholder] = value
    })
    return linkedFields
  }

  static validatePlaceholdersInHtml({ old: { ec__html, ec__pts_only } }) {
    const fields = config.get('ec__linked_fields_config')
    if (ec__pts_only === false && ec__html && ec__html.length) {
      // Test un-supported placeholders
      const placeholdersUsed = (ec__html.match(/\[\[\s*(\w+)\s*\]\]/g) || [])
        .map(function(x) { return x.match(/[\w.]+/)[0] })

      const supportedPlaceholders = fields.map(({ ec__placeholder }) => ec__placeholder)
      const difference = placeholdersUsed.filter(x => !supportedPlaceholders.includes(x))
      if (difference.length) {
        faults.throw('econsent.validationError.invalidLinkedFieldPlaceholder')
      }

      // Test Invalid placeholders
      let inputHtml = _.clone(ec__html)
      const bad = []
      // eslint-disable-next-line no-useless-escape
      inputHtml = inputHtml.replace(/(\]\]\]+)|(\[\[\[+)/g, m => bad.push(m)) // match 3 or more delimiters
      if (!bad.length) {
        // eslint-disable-next-line no-useless-escape
        inputHtml = inputHtml.replace(/\[\[\s*[\w.]+\s*\]\]/g, '')
      }
      if (!bad.length) {
        // eslint-disable-next-line no-useless-escape
        inputHtml = inputHtml.replace(/\[\[+[^\[\]]+/g, m => bad.push(m))
      }

      if (bad.length > 0 || inputHtml.includes('[[') || inputHtml.includes(']]')) {
        faults.throw('econsent.validationError.invalidLinkedFieldPlaceholder')
      }
    }
  }

  static validateSiteFields(site, lang) {
    const fields = config.get('ec__linked_fields_config')
    const lfs = EconsentUtilities.constructSiteLinkedFields(site, lang)

    for (const { ec__key, ec__placeholder } of fields.filter(({ ec__optional }) => !ec__optional)) {
      const ec__value = get(lfs, ec__placeholder)
      if (!ec__value) {
        logger.info(`Below linked field is missing from site "${site.c_name || site._id}"`, { ec__key, ec__placeholder, ec__value })
        faults.throw('econsent.validationError.missingLinkedFieldValue')
      }
    }
  }

  static isNewSiteUser(accountRoles) {
    const allowedSiteRoleIds = NewSiteAccountRoles.map(v => consts.roles[v].toString())
    return accountRoles.some(v => allowedSiteRoleIds.includes(v.toString()))
  }

  static isSiteUser() {
    if (EconsentUtilities.isNewSiteUser(script.principal.roles)) {
      const { c_site_access_list: siteAccessList } = org.objects.accounts.find({ _id: script.principal._id })
        .paths('c_site_access_list')
        .next()

      return !!siteAccessList
    } else {
      const siteIds = org.objects.c_sites.find()
        .paths('_id')
        .map(site => site._id)

      const siteUser = org.objects.c_site_users
        .readOne({
          c_account: script.principal._id,
          c_site: { $in: siteIds }
        })
        .paths('_id')
        .skipAcl()
        .grant(accessLevels.read)
        .throwNotFound(false)
        .execute()

      return !!siteUser
    }
  }

  static validateParticipant(invites, template) {
    const participantSignerRole = template.ec__signer_roles.find(v => ['participant', 'non-signing participant'].includes(v.ec__signer_type))
    const participantInvite = participantSignerRole && invites.find(v => v.ec__signer_role === participantSignerRole.ec__role)
    if (participantInvite) {
      let publicUser = null

      // For PTS with c_public_user, look up by _id instead of email
      if (participantInvite.c_public_user) {
        publicUser = org.objects.c_public_user.readOne({ _id: participantInvite.c_public_user })
          .paths('c_status')
          .skipAcl()
          .grant(accessLevels.read)
          .throwNotFound(false)
          .execute()
      } else if (participantInvite.ec__email && !EconsentUtilities.isPtsDummyEmail(participantInvite.ec__email)) {
        // Fallback to email lookup for non-PTS or when email is provided
        publicUser = org.objects.c_public_user.readOne({ c_email: participantInvite.ec__email })
          .paths('c_status')
          .skipAcl()
          .grant(accessLevels.read)
          .throwNotFound(false)
          .execute()
      }

      if (publicUser && publicUser.c_status === 'Deactivated') {
        faults.throw(('econsent.validationError.noDocumentInviteToDeactivatedParticipant'))
      }
    }
  }

}

const countryNames = {
  en: {
    AF: 'Afghanistan',
    AX: 'Åland Islands',
    AL: 'Albania',
    DZ: 'Algeria',
    AS: 'American Samoa',
    AD: 'Andorra',
    AO: 'Angola',
    AI: 'Anguilla',
    AQ: 'Antarctica',
    AG: 'Antigua & Barbuda',
    AR: 'Argentina',
    AM: 'Armenia',
    AW: 'Aruba',
    AU: 'Australia',
    AT: 'Austria',
    AZ: 'Azerbaijan',
    BS: 'Bahamas',
    BH: 'Bahrain',
    BD: 'Bangladesh',
    BB: 'Barbados',
    BY: 'Belarus',
    BE: 'Belgium',
    BZ: 'Belize',
    BJ: 'Benin',
    BM: 'Bermuda',
    BT: 'Bhutan',
    BO: 'Bolivia',
    BQ: 'Caribbean Netherlands',
    BA: 'Bosnia & Herzegovina',
    BW: 'Botswana',
    BV: 'Bouvet Island',
    BR: 'Brazil',
    IO: 'British Indian Ocean Territory',
    BN: 'Brunei',
    BG: 'Bulgaria',
    BF: 'Burkina Faso',
    BI: 'Burundi',
    CV: 'Cape Verde',
    KH: 'Cambodia',
    CM: 'Cameroon',
    CA: 'Canada',
    KY: 'Cayman Islands',
    CF: 'Central African Republic',
    TD: 'Chad',
    CL: 'Chile',
    CN: 'China',
    CX: 'Christmas Island',
    CC: 'Cocos (Keeling) Islands',
    CO: 'Colombia',
    KM: 'Comoros',
    CG: 'Congo - Brazzaville',
    CD: 'Congo - Kinshasa',
    CK: 'Cook Islands',
    CR: 'Costa Rica',
    CI: 'Côte d’Ivoire',
    HR: 'Croatia',
    CU: 'Cuba',
    CW: 'Curaçao',
    CY: 'Cyprus',
    CZ: 'Czechia',
    DK: 'Denmark',
    DJ: 'Djibouti',
    DM: 'Dominica',
    DO: 'Dominican Republic',
    EC: 'Ecuador',
    EG: 'Egypt',
    SV: 'El Salvador',
    GQ: 'Equatorial Guinea',
    ER: 'Eritrea',
    EE: 'Estonia',
    SZ: 'Eswatini',
    ET: 'Ethiopia',
    FK: 'Falkland Islands',
    FO: 'Faroe Islands',
    FJ: 'Fiji',
    FI: 'Finland',
    FR: 'France',
    GF: 'French Guiana',
    PF: 'French Polynesia',
    TF: 'French Southern Territories',
    GA: 'Gabon',
    GM: 'Gambia',
    GE: 'Georgia',
    DE: 'Germany',
    GH: 'Ghana',
    GI: 'Gibraltar',
    GR: 'Greece',
    GL: 'Greenland',
    GD: 'Grenada',
    GP: 'Guadeloupe',
    GU: 'Guam',
    GT: 'Guatemala',
    GG: 'Guernsey',
    GN: 'Guinea',
    GW: 'Guinea-Bissau',
    GY: 'Guyana',
    HT: 'Haiti',
    HM: 'Heard & McDonald Islands',
    VA: 'Vatican City',
    HN: 'Honduras',
    HK: 'Hong Kong SAR China',
    HU: 'Hungary',
    IS: 'Iceland',
    IN: 'India',
    ID: 'Indonesia',
    IR: 'Iran',
    IQ: 'Iraq',
    IE: 'Ireland',
    IM: 'Isle of Man',
    IL: 'Israel',
    IT: 'Italy',
    JM: 'Jamaica',
    JP: 'Japan',
    JE: 'Jersey',
    JO: 'Jordan',
    KZ: 'Kazakhstan',
    KE: 'Kenya',
    KI: 'Kiribati',
    KP: 'North Korea',
    KR: 'South Korea',
    KW: 'Kuwait',
    KG: 'Kyrgyzstan',
    LA: 'Laos',
    LV: 'Latvia',
    LB: 'Lebanon',
    LS: 'Lesotho',
    LR: 'Liberia',
    LY: 'Libya',
    LI: 'Liechtenstein',
    LT: 'Lithuania',
    LU: 'Luxembourg',
    MO: 'Macao SAR China',
    MG: 'Madagascar',
    MW: 'Malawi',
    MY: 'Malaysia',
    MV: 'Maldives',
    ML: 'Mali',
    MT: 'Malta',
    MH: 'Marshall Islands',
    MQ: 'Martinique',
    MR: 'Mauritania',
    MU: 'Mauritius',
    YT: 'Mayotte',
    MX: 'Mexico',
    FM: 'Micronesia',
    MD: 'Moldova',
    MC: 'Monaco',
    MN: 'Mongolia',
    ME: 'Montenegro',
    MS: 'Montserrat',
    MA: 'Morocco',
    MZ: 'Mozambique',
    MM: 'Myanmar (Burma)',
    NA: 'Namibia',
    NR: 'Nauru',
    NP: 'Nepal',
    NL: 'Netherlands',
    NC: 'New Caledonia',
    NZ: 'New Zealand',
    NI: 'Nicaragua',
    NE: 'Niger',
    NG: 'Nigeria',
    NU: 'Niue',
    NF: 'Norfolk Island',
    MK: 'North Macedonia',
    MP: 'Northern Mariana Islands',
    NO: 'Norway',
    OM: 'Oman',
    PK: 'Pakistan',
    PW: 'Palau',
    PS: 'Palestinian Territories',
    PA: 'Panama',
    PG: 'Papua New Guinea',
    PY: 'Paraguay',
    PE: 'Peru',
    PH: 'Philippines',
    PN: 'Pitcairn Islands',
    PL: 'Poland',
    PT: 'Portugal',
    PR: 'Puerto Rico',
    QA: 'Qatar',
    RE: 'Réunion',
    RO: 'Romania',
    RU: 'Russia',
    RW: 'Rwanda',
    BL: 'St. Barthélemy',
    SH: 'St. Helena',
    KN: 'St. Kitts & Nevis',
    LC: 'St. Lucia',
    MF: 'St. Martin',
    PM: 'St. Pierre & Miquelon',
    VC: 'St. Vincent & Grenadines',
    WS: 'Samoa',
    SM: 'San Marino',
    ST: 'São Tomé & Príncipe',
    SA: 'Saudi Arabia',
    SN: 'Senegal',
    RS: 'Serbia',
    SC: 'Seychelles',
    SL: 'Sierra Leone',
    SG: 'Singapore',
    SX: 'Sint Maarten',
    SK: 'Slovakia',
    SI: 'Slovenia',
    SB: 'Solomon Islands',
    SO: 'Somalia',
    ZA: 'South Africa',
    GS: 'South Georgia & South Sandwich Islands',
    SS: 'South Sudan',
    ES: 'Spain',
    LK: 'Sri Lanka',
    SD: 'Sudan',
    SR: 'Suriname',
    SJ: 'Svalbard & Jan Mayen',
    SE: 'Sweden',
    CH: 'Switzerland',
    SY: 'Syria',
    TW: 'Taiwan',
    TJ: 'Tajikistan',
    TZ: 'Tanzania',
    TH: 'Thailand',
    TL: 'Timor-Leste',
    TG: 'Togo',
    TK: 'Tokelau',
    TO: 'Tonga',
    TT: 'Trinidad & Tobago',
    TN: 'Tunisia',
    TR: 'Turkey',
    TM: 'Turkmenistan',
    TC: 'Turks & Caicos Islands',
    TV: 'Tuvalu',
    UG: 'Uganda',
    UA: 'Ukraine',
    AE: 'United Arab Emirates',
    GB: 'United Kingdom',
    US: 'United States',
    UM: 'U.S. Outlying Islands',
    UY: 'Uruguay',
    UZ: 'Uzbekistan',
    VU: 'Vanuatu',
    VE: 'Venezuela',
    VN: 'Vietnam',
    VG: 'British Virgin Islands',
    VI: 'U.S. Virgin Islands',
    WF: 'Wallis & Futuna',
    EH: 'Western Sahara',
    YE: 'Yemen',
    ZM: 'Zambia',
    ZW: 'Zimbabwe'
  },
  es: {
    AF: 'Afganistán',
    AX: 'Islas Aland',
    AL: 'Albania',
    DZ: 'Argelia',
    AS: 'Samoa Americana',
    AD: 'Andorra',
    AO: 'Angola',
    AI: 'Anguila',
    AQ: 'Antártida',
    AG: 'Antigua y Barbuda',
    AR: 'Argentina',
    AM: 'Armenia',
    AW: 'Aruba',
    AU: 'Australia',
    AT: 'Austria',
    AZ: 'Azerbaiyán',
    BS: 'Bahamas',
    BH: 'Baréin',
    BD: 'Bangladés',
    BB: 'Barbados',
    BY: 'Bielorrusia',
    BE: 'Bélgica',
    BZ: 'Belice',
    BJ: 'Benín',
    BM: 'Bermudas',
    BT: 'Bután',
    BO: 'Bolivia',
    BQ: 'Caribe neerlandés',
    BA: 'Bosnia y Herzegovina',
    BW: 'Botsuana',
    BV: 'Isla Bouvet',
    BR: 'Brasil',
    IO: 'Territorio Británico del Océano Índico',
    BN: 'Brunéi',
    BG: 'Bulgaria',
    BF: 'Burkina Faso',
    BI: 'Burundi',
    CV: 'Cabo Verde',
    KH: 'Camboya',
    CM: 'Camerún',
    CA: 'Canadá',
    KY: 'Islas Caimán',
    CF: 'República Centroafricana',
    TD: 'Chad',
    CL: 'Chile',
    CN: 'China',
    CX: 'Isla de Navidad',
    CC: 'Islas Cocos',
    CO: 'Colombia',
    KM: 'Comoras',
    CG: 'Congo',
    CD: 'República Democrática del Congo',
    CK: 'Islas Cook',
    CR: 'Costa Rica',
    CI: 'Côte d’Ivoire',
    HR: 'Croacia',
    CU: 'Cuba',
    CW: 'Curazao',
    CY: 'Chipre',
    CZ: 'Chequia',
    DK: 'Dinamarca',
    DJ: 'Yibuti',
    DM: 'Dominica',
    DO: 'República Dominicana',
    EC: 'Ecuador',
    EG: 'Egipto',
    SV: 'El Salvador',
    GQ: 'Guinea Ecuatorial',
    ER: 'Eritrea',
    EE: 'Estonia',
    SZ: 'Esuatini',
    ET: 'Etiopía',
    FK: 'Islas Malvinas',
    FO: 'Islas Feroe',
    FJ: 'Fiyi',
    FI: 'Finlandia',
    FR: 'Francia',
    GF: 'Guayana Francesa',
    PF: 'Polinesia Francesa',
    TF: 'Territorios Australes Franceses',
    GA: 'Gabón',
    GM: 'Gambia',
    GE: 'Georgia',
    DE: 'Alemania',
    GH: 'Ghana',
    GI: 'Gibraltar',
    GR: 'Grecia',
    GL: 'Groenlandia',
    GD: 'Granada',
    GP: 'Guadalupe',
    GU: 'Guam',
    GT: 'Guatemala',
    GG: 'Guernesey',
    GN: 'Guinea',
    GW: 'Guinea-Bisáu',
    GY: 'Guyana',
    HT: 'Haití',
    HM: 'Islas Heard y McDonald',
    VA: 'Ciudad del Vaticano',
    HN: 'Honduras',
    HK: 'RAE de Hong Kong (China)',
    HU: 'Hungría',
    IS: 'Islandia',
    IN: 'India',
    ID: 'Indonesia',
    IR: 'Irán',
    IQ: 'Irak',
    IE: 'Irlanda',
    IM: 'Isla de Man',
    IL: 'Israel',
    IT: 'Italia',
    JM: 'Jamaica',
    JP: 'Japón',
    JE: 'Jersey',
    JO: 'Jordania',
    KZ: 'Kazajistán',
    KE: 'Kenia',
    KI: 'Kiribati',
    KP: 'Corea del Norte',
    KR: 'Corea del Sur',
    KW: 'Kuwait',
    KG: 'Kirguistán',
    LA: 'Laos',
    LV: 'Letonia',
    LB: 'Líbano',
    LS: 'Lesoto',
    LR: 'Liberia',
    LY: 'Libia',
    LI: 'Liechtenstein',
    LT: 'Lituania',
    LU: 'Luxemburgo',
    MO: 'RAE de Macao (China)',
    MG: 'Madagascar',
    MW: 'Malaui',
    MY: 'Malasia',
    MV: 'Maldivas',
    ML: 'Mali',
    MT: 'Malta',
    MH: 'Islas Marshall',
    MQ: 'Martinica',
    MR: 'Mauritania',
    MU: 'Mauricio',
    YT: 'Mayotte',
    MX: 'México',
    FM: 'Micronesia',
    MD: 'Moldavia',
    MC: 'Mónaco',
    MN: 'Mongolia',
    ME: 'Montenegro',
    MS: 'Montserrat',
    MA: 'Marruecos',
    MZ: 'Mozambique',
    MM: 'Myanmar (Birmania)',
    NA: 'Namibia',
    NR: 'Nauru',
    NP: 'Nepal',
    NL: 'Países Bajos',
    NC: 'Nueva Caledonia',
    NZ: 'Nueva Zelanda',
    NI: 'Nicaragua',
    NE: 'Níger',
    NG: 'Nigeria',
    NU: 'Niue',
    NF: 'Isla Norfolk',
    MK: 'Macedonia del Norte',
    MP: 'Islas Marianas del Norte',
    NO: 'Noruega',
    OM: 'Omán',
    PK: 'Pakistán',
    PW: 'Palaos',
    PS: 'Territorios Palestinos',
    PA: 'Panamá',
    PG: 'Papúa Nueva Guinea',
    PY: 'Paraguay',
    PE: 'Perú',
    PH: 'Filipinas',
    PN: 'Islas Pitcairn',
    PL: 'Polonia',
    PT: 'Portugal',
    PR: 'Puerto Rico',
    QA: 'Catar',
    RE: 'Reunión',
    RO: 'Rumanía',
    RU: 'Rusia',
    RW: 'Ruanda',
    BL: 'San Bartolomé',
    SH: 'Santa Elena',
    KN: 'San Cristóbal y Nieves',
    LC: 'Santa Lucía',
    MF: 'San Martín',
    PM: 'San Pedro y Miquelón',
    VC: 'San Vicente y las Granadinas',
    WS: 'Samoa',
    SM: 'San Marino',
    ST: 'Santo Tomé y Príncipe',
    SA: 'Arabia Saudí',
    SN: 'Senegal',
    RS: 'Serbia',
    SC: 'Seychelles',
    SL: 'Sierra Leona',
    SG: 'Singapur',
    SX: 'Sint Maarten',
    SK: 'Eslovaquia',
    SI: 'Eslovenia',
    SB: 'Islas Salomón',
    SO: 'Somalia',
    ZA: 'Sudáfrica',
    GS: 'Islas Georgia del Sur y Sandwich del Sur',
    SS: 'Sudán del Sur',
    ES: 'España',
    LK: 'Sri Lanka',
    SD: 'Sudán',
    SR: 'Surinam',
    SJ: 'Svalbard y Jan Mayen',
    SE: 'Suecia',
    CH: 'Suiza',
    SY: 'Siria',
    TW: 'Taiwán',
    TJ: 'Tayikistán',
    TZ: 'Tanzania',
    TH: 'Tailandia',
    TL: 'Timor-Leste',
    TG: 'Togo',
    TK: 'Tokelau',
    TO: 'Tonga',
    TT: 'Trinidad y Tobago',
    TN: 'Túnez',
    TR: 'Turquía',
    TM: 'Turkmenistán',
    TC: 'Islas Turcas y Caicos',
    TV: 'Tuvalu',
    UG: 'Uganda',
    UA: 'Ucrania',
    AE: 'Emiratos Árabes Unidos',
    GB: 'Reino Unido',
    US: 'Estados Unidos',
    UM: 'Islas menores alejadas de EE. UU.',
    UY: 'Uruguay',
    UZ: 'Uzbekistán',
    VU: 'Vanuatu',
    VE: 'Venezuela',
    VN: 'Vietnam',
    VG: 'Islas Vírgenes Británicas',
    VI: 'Islas Vírgenes de EE. UU.',
    WF: 'Wallis y Futuna',
    EH: 'Sáhara Occidental',
    YE: 'Yemen',
    ZM: 'Zambia',
    ZW: 'Zimbabue'
  }
}

module.exports = EconsentUtilities