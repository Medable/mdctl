import handlebars from 'handlebars'
import moment from 'moment.timezone'
import _ from 'lodash'
import LinkedFields from 'ec__linked_fields_runtimes'
import logger from 'logger'

const selectOptionsPartial = `
  <div class="document-input multiple-choice {{enabled}}" {{{enabled}}}>
    {{#each options}}
    <div class="input-checkbox styled-block" data-choice="{{value}}">
      <label class="styled-checkbox-wrapper">
        <input class="dataCollect styled-checkbox-wrapper" type="{{../multi}}" data-choice="{{value}}" name="{{../id}}" {{{set}}} {{{../enabled}}} />
        <span class="checkbox-label">{{label}}</span>
        <div class="styled-checkbox"></div>
      </label>
    </div>
    {{/each}}
  </div>`

const signedElementPartial = `
  <label class="styled-label {{required}}">{{label}}</label>
  <div id="{{id}}" class="document-input signbox signed success">
  <div class="signature-icon {{iconClassName}}"></div>
    <div class="sigText" style="{{signatureStyle}}">
      <span>{{name}}</span><br>
      {{role}} {{didAction}}  <br>
      {{date}} ({{sigId}})<br>
    </div>
  </div>`

const ssoSignedElementPartial = `
  <label class="styled-label {{required}}">{{label}}</label>
  <div id="{{id}}" class="document-input signbox signed success">
  <div class="signature-icon {{iconClassName}}"></div>
    <div class="sigText" style="{{signatureStyle}}">
      <span>{{name}}</span><br>
      {{role}} {{didActionSSO}}  <br>
      {{date}} ({{sigId}})<br>
    </div>
  </div>`

const needsSignaturePartial = `
  <label class="styled-label {{required}}">{{label}}</label>
  <div id="{{id}}" class="document-input signbox needSig">
    <div class="signature-icon {{iconClassName}}" style="pointer-events:none;"></div>
    <div class="sigText" style="pointer-events:none; {{signatureStyle}}">
      {{willAction}}
    </div>
  </div>`

const disabledSignaturePartial = `
  <label class="styled-label {{required}}">{{label}}</label>
  <div id="{{id}}" class="document-input signbox disabledSig disabled">
    <div class="signature-icon {{iconClassName}}"></div>
    <div class="sigText" style="{{signatureStyle}}">
      {{willAction}}
    </div>
  </div>`

//  Knowledge Check segments and partials
const _submitBtnSegment = `
  {{#if canAnswerKC}}
    <div data-gjs-type="styled-block">
      <button id="{{id}}" disabled class='submit-btn kc-submit-btn'>{{submitBtnText}}</button>
    </div>
  {{/if}}`

const _answerContextSegment = `
  <p>
    {{answerContext}}
  </p>`

const initialKnowledgeCheckPartial = `
  <div data-gjs-type="styled-block-choices" class="styled-kc-block-choices">
    {{#each kcOptions}}
      <div class="input-checkbox styled-block" data-choice="{{value}}">
        <label class="styled-checkbox-wrapper">
          <input type="radio" value="{{value}}" class="kc-option" name="{{../id}}" {{../checkBoxEnabled}} />
          <span data-gjs-type="styled-span" class="checkbox-label" >{{label}}</span>
          <div data-gjs-type="styled-block" class="styled-checkbox"></div>
        </label>
      </div>
    {{/each}}
  </div> ${_submitBtnSegment}`

const correctAnswerPartial = `
  <div class="kc-correct-answer-box">
    <div class="doc-icon kc-correct-answer-icon"></div>
    <div class="kc-correct-answer-text">
      {{correctAnswerPromptText}}:  "{{correctAnswer}}"
    </div>
  </div> ${_answerContextSegment}`

const wrongAnswerPartial = `
  <div class="kc-wrong-answer-box">
    <div class="doc-icon kc-wrong-answer-icon"></div>
    <div class="kc-wrong-answer-text">
      {{wrongAnswerPromptText}}: "{{correctAnswer}}"
    </div>
  </div> ${_answerContextSegment}`

handlebars.registerPartial('signedElementPartial', signedElementPartial)
handlebars.registerPartial('ssoSignedElementPartial', ssoSignedElementPartial)
handlebars.registerPartial('needsSignaturePartial', needsSignaturePartial)
handlebars.registerPartial('disabledSignaturePartial', disabledSignaturePartial)
handlebars.registerPartial('selectOptionsPartial', selectOptionsPartial)
handlebars.registerPartial(
  'initialKnowledgeCheckPartial',
  initialKnowledgeCheckPartial
)
handlebars.registerPartial('correctAnswerPartial', correctAnswerPartial)
handlebars.registerPartial('wrongAnswerPartial', wrongAnswerPartial)

const defaultJS = `
function load(){
  init()
  let expandableBlocks = document.getElementsByClassName('expandable')
  for (let i in expandableBlocks) {
    expandableBlocks[i].onclick = toggleExpandable
  }
}
function toggleExpandable(event){
  if(event.target.classList.contains('expandable-header')){
    event.currentTarget.classList.toggle('closed')
  }
}
window.onload = load
`
const readOnlyJs = `
  function getDocHeight () {
    const body = document.body, html = document.documentElement
    const height = Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight)
    return height
  }

  function init () {
    window.top.postMessage({
      type: 'ready',
      message: getDocHeight(),
    }, '*')
  }
`

const editableJs = `
  let storedSignatures = []
  let storedData = []

  function getDocHeight () {
    const body = document.body, html = document.documentElement
    const height = Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight)
    return height
  }

  function init () {
    window.addEventListener('message', receiveMessage);

    addCallbacks()

    window.top.postMessage({
      type: 'ready',
      message: getDocHeight(),
    }, '*')
  }

  function selectDate (event) {
    let el = event.target
    window.top.postMessage({
      id: el.id,
      type: 'selectDate'
    })
  }

  function handleInputChange (event) {
    const el = event.target
    let spanTag = document.getElementById('input-error-'+el.id)
    
    if(spanTag) {
      //  If span tag exists then new validation feature can be executed
      const numPattern = /^\\d+$/
      const emailPattern = /^(([^<>()[\\]\\.,;:\\s@"]+(\\.[^<>()[\\]\\.,;:\\s@"]+)*)|(".+"))@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\])|(([a-zA-Z\\-0-9]+\\.)+[a-zA-Z]{2,}))$/ 
      if(el.type === 'email' && !emailPattern.test(el.value)) {
        spanTag.style.display = 'block'
      } else if(el.type === 'number' && !numPattern.test(el.value)) {
        spanTag.style.display = 'block'
      } else {
        spanTag.style.display = 'none'
      }
    }

    // Start data collection in 500 milliseconds after the last input change
    debouncedDataCollection(500)(event)
  }

  function addCallbacks() {
    let dataBlocks = document.getElementsByClassName('dataCollect')

    for (let i in dataBlocks) {
      dataBlocks[i].onchange = startDataCollection
    }

    let signatureBlocks = document.getElementsByClassName('needSig')
    for (let i in signatureBlocks) {
      signatureBlocks[i].onclick = startSigCollection
    }

    let dateInputs = document.getElementsByClassName('date-input')
    for (let i in dateInputs) {
      dateInputs[i].onclick = selectDate
    }

    let kcSubmitBtns = document.getElementsByClassName('submit-btn')
    for (let i in kcSubmitBtns) {
      kcSubmitBtns[i].onclick = handleKnowledgeCheckSubmit
    }

    let kcOptions = document.getElementsByClassName('kc-option')
    for (let i in kcOptions) {
      kcOptions[i].onclick = function() {
        document.getElementById(this.name).disabled = false
      }
    }

    let textInputs = document.getElementsByClassName('text-input')
    for(let i in textInputs) {
      textInputs[i].oninput = handleInputChange
    }
  }

  function startSigCollection (event) {
    window.top.postMessage({
        id: event.target.id,
        type: 'signature',
        error: false,
        message: 'signature'
      },
      '*'
    )
  }

  function startDataCollection(event) {
    let message
    let dataId
    let dataValue
    if(event.type === 'change' && (event.target.type === 'checkbox' || event.target.type === 'radio')) {
      var parent = event.target.closest('.styled-block-choices')
      if(!parent) {
        parent = event.target.closest('.multiple-choice')
      }
      var checkBoxesSelected = parent.querySelectorAll('input[type="' + event.target.type + '"]:checked')
      var results = []

      checkBoxesSelected.forEach(function(v) {
        results.push(v.getAttribute('data-choice'))
      })

      dataId = event.target.getAttribute('name')

      let dirtyValue = results.join('**')
      dataValue = dirtyValue.trim() ? dirtyValue.trim() : undefined
    } else if(event.type === 'change' && event.target.getAttribute('data-collect-function') === 'startDataCollection') {
      dataId = event.target.getAttribute('parentid') ? event.target.getAttribute('parentid') : event.target.id

      let dirtyValue = event.target.type === 'checkbox' ? event.target.checked : event.target.value
      dataValue = dirtyValue.trim() ? dirtyValue.trim() : undefined
    }
    message = {
      id: dataId,
      value: dataValue,
      type: 'data',
      error: false,
      message: 'data',
      height: document.body.scrollHeight
    }
    window.top.postMessage(message,'*')
  }

  let timer

  const debouncedDataCollection = (wait) => (event) => {
    
    // Execute this function after the defined timeout
    const executeLater = () => {
      // Trim input's value
      const trimmedValue = event.target.value.trim()
      let value = trimmedValue ? trimmedValue : undefined
      
      // Create a message to send it to the iframe
      const message = {
        id: event.target.getAttribute('parentid') ? event.target.getAttribute('parentid') : event.target.id,
        value,
        type: 'data',
        error: false,
        message: 'data',
        height: document.body.scrollHeight
      }

      // Send a message to the iframe
      window.top.postMessage(message,'*')
    }

    // Clear previous timer
    clearTimeout(timer)
    // Set a new timer
    timer = setTimeout(executeLater, wait)
  }

  function receiveMessage(event) {
    let ev = event.data

    if(ev.type === 'bodyUpdate') {
      document.body.innerHTML = ev.data
      addCallbacks()
      load()
    } else if (ev.type === 'setDateInput') {
      let inputId = ev.id
      let el = document.getElementById(inputId)
      el.setAttribute('data-collect-function', 'startDataCollection')
      el.value = ev.value
      let event = new Event('change')
      el.dispatchEvent(event)
    }
  }

  function handleKnowledgeCheckSubmit (event) {
    let el = event.target
    let kcRadioOptions = document.getElementsByName(el.id);
    let chosenAnswer = '';
    kcRadioOptions.forEach(function(option) {
      if(option.checked) {
        chosenAnswer = option.value
      }
    })
    window.top.postMessage({
      id: el.id,
      kcChosenAnswer: chosenAnswer,
      type: 'knowledgeChecks'
    })
  }

  window.onload = init
`

const withHtml = ({ head, body }) =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Document</title>${head}</head><body>${body}</body></html>`
const emptyHtml = withHtml({ body: '<h1>Empty</h1>' })

export class DocumentProcessor {

  static buildTemplateHtml(documentTemplate, { readOnly, bodyOnly }) {
    const bodyHtml = documentTemplate.ec__html || emptyHtml

    if (bodyOnly) {
      return bodyHtml
    }

    const styles = this.getStyles(documentTemplate)

    return withHtml({
      head: `${styles}<script>${
        readOnly ? readOnlyJs : editableJs
      } ${defaultJS}</script>`,
      body: bodyHtml
    })
  }

  /**
   * !--- Extra care when modifying this file ---!
   * The whole contents of this file is used in both the frontend and backend code
   * of econsent.  Any options passed down will need to somehow be available by the
   * frontend and backend code.
   *
   * Whenever this file is changed, it needs to be copied over and submitted to:
   * `https://gitlab.medable.com/product/web/econsent-enviroment/`
   * at `/configuration/env/scripts/js/library.ec__document_processor.js`
   * So that the both front-end / backend document rendering is consistent.
   */
  static getDocumentHtml(signedDocument, options = {}) {
    const { currentUser = {}, readOnly = true, bodyOnly } = options

    const { isActiveSigner, signerRole } = currentUser

    /**
     * If the current user is not the active signer
     * We don't include any of the JS code to manage
     * input fields / change the actual document.
     */
    const editable = isActiveSigner && !readOnly

    const htmlTemplate = this.buildTemplateHtml(
      signedDocument.ec__document_template,
      {
        readOnly: !editable,
        bodyOnly
      }
    )

    // TODO the compiled template should be cached
    const compiledTemplate = handlebars.compile(htmlTemplate)

    const data = this.getDocumentData(
      signedDocument,
      editable ? signerRole : null,
      options
    )

    const ec__html = compiledTemplate(data)

    // Are we rendering a template?
    if (!signedDocument.ec__site) {
      let siteId

      if (options.ec__site) {
        siteId = options.ec__site
      } else if (
        signedDocument.ec__document_template &&
        signedDocument.ec__document_template.ec__sites &&
        signedDocument.ec__document_template.ec__sites.length
      ) {
        siteId = signedDocument.ec__document_template.ec__sites[0]
      } else {
        siteId = LinkedFields.getDefaultSite()
      }

      signedDocument.ec__site = {
        _id: siteId
      }
    }

    return LinkedFields.renderLinkedFields({ documentTemplate: signedDocument.ec__document_template, signedDocument, ec__html })
  }

  static getDocumentData(signedDocument, currentSignerRole, { c_site, fields } = { c_site: {}, fields: {} }) {

    //  Explanation for this: So pre-econsent-1.2.1, the document processor had
    //  hard coded strings for signatures and knowledge check.
    //  To be able to support old templates with English and new templates with mutli-language support
    //  we need this property 'ec__econsent_version' on the template to support old templates by setting
    //  default english text on signatures and knowledge check. New templates will have their appropriate
    //  ML text passed in through the toHTML method on template creation
    const hasTranslatedStrings =
      signedDocument &&
      signedDocument.ec__document_template &&
      signedDocument.ec__document_template.ec__econsent_version

    const documentTemplate = signedDocument.ec__document_template
    const langCode = documentTemplate.ec__language.replace(/_/g, '-'),
          hour24_format = ['hi-IN', 'mr-IN'],
          intlOptions = hour24_format.includes(langCode)
            ? {
              timeZone: 'UTC',
              dateStyle: 'full',
              timeStyle: 'long',
              hourCycle: 'h24'
            }
            : {
              timeZone: 'UTC',
              dateStyle: 'full',
              timeStyle: 'long'
            }
    const docData = {
      assets: {},
      signatures: {},
      data: {},
      knowledgeChecks: {}
    }

    const acceptedSigner =
      signedDocument &&
      signedDocument.ec__accepted_signers &&
      signedDocument.ec__accepted_signers.find(
        (v) => v.ec__signer_role === currentSignerRole
      )
    const completed =
      acceptedSigner &&
      (signedDocument.ec__status === 'complete' ||
        acceptedSigner.ec__status === 'complete')

    documentTemplate.ec__assets.forEach((v) => {
      docData.assets[v.ec__key] = {
        url: v.ec__file.url
      }
    })

    documentTemplate.ec__requested_signatures.forEach((v) => {
      docData.signatures[v.ec__key] = {
        partial: 'disabledSignaturePartial',
        id: v.ec__key,
        role: v.ec__signer_role,
        initials: v.ec__initials,
        iconClassName: v.ec__initials ? 'initials' : 'signature',
        signatureStyle: this.isRtlTemplate(documentTemplate.ec__language)
          ? 'font-weight: 400;'
          : '',
        label: v.ec__label,
        required: v.ec__optional ? '' : 'required'
      }

      //  Set default text if none passed in from template's toHTML
      if (!hasTranslatedStrings) {
        docData.signatures[v.ec__key].willAction = `${v.ec__signer_role} ${
          v.ec__initials ? 'INITIALS HERE' : 'SIGN HERE'
        }`
      }

      const existingSig =
        signedDocument &&
        signedDocument.ec__signatures &&
        signedDocument.ec__signatures.data.find(
          (s) => s.value.ec__signature_identifier === v.ec__key
        )

      if (existingSig) {
        docData.signatures[v.ec__key].partial =
          existingSig.value.ec__sign_method === 'sso'
            ? 'ssoSignedElementPartial'
            : 'signedElementPartial'
        docData.signatures[v.ec__key].date = new Intl.DateTimeFormat(langCode, {
          ...intlOptions
        })
          .format(Date.parse(existingSig.created))
        docData.signatures[v.ec__key].name = v.ec__initials
          ? existingSig.value.signed_initials
          : existingSig.signer
        docData.signatures[v.ec__key].sigId = existingSig._id

        //  This is hard coded in here. Reason being:
        //  If the didActionSSO string exists on the handlebars from at the time the template is being built it overrides this during compilation
        //  otherwise it shows this string as default
        docData.signatures[v.ec__key].didActionSSO =
          'accepts with Single Sign On (SSO)'

        //  Set default text if none passed in from template's toHTML
        if (!hasTranslatedStrings) {
          docData.signatures[v.ec__key].didAction = v.ec__initials
            ? 'initialed with password credentials'
            : 'signed with password credentials'
        }
      } else if (!completed && currentSignerRole === v.ec__signer_role) {
        docData.signatures[v.ec__key].partial = 'needsSignaturePartial'
      }
    })

    //  Knowledge checks
    const kcData =
      documentTemplate.ec__knowledge_checks &&
      documentTemplate.ec__knowledge_checks.data

    kcData &&
      kcData.forEach((v) => {
        //  Get user selected answers. Selected answers is an array
        const foundData =
          signedDocument.ec__required_data &&
          signedDocument.ec__required_data.data &&
          signedDocument.ec__required_data.data.find(
            (dt) => dt.ec__identifier === v.ec__key
          )
        const userSelectedAnswers = foundData && foundData.ec__value

        //  Selected answer, its the first option for now
        //  Right now its single answers only, for multiple answers, this will change
        const userSelectedAnswer = userSelectedAnswers
          ? userSelectedAnswers[0]
          : ''

        const kcOptions = v.ec__options.map((v) => {
          return { value: v, label: v }
        })

        //  Correct Answer
        const correctAnswer =
          (v.ec__options_answer && v.ec__options_answer[0]) || ''

        // Who can answer KC
        const canAnswerKC = v.ec__signer_role === currentSignerRole

        //  Set initial content
        docData.knowledgeChecks[v.ec__key] = {
          answerContext: v.ec__answer_context || '',
          canAnswerKC,
          checkBoxEnabled: !canAnswerKC ? 'disabled' : '',

          //  This might have to be touched in case multiple correct answers are requested later
          //  'atob' -> decrypt the encrypted text. This file is shared with API so we cant include
          //  local files as dependencies
          correctAnswer,
          id: v.ec__key,
          kcOptions,
          partial: 'initialKnowledgeCheckPartial'
        }

        const isAnswerCorrect = userSelectedAnswer === correctAnswer

        if (userSelectedAnswer) {
          docData.knowledgeChecks[v.ec__key].partial = isAnswerCorrect
            ? 'correctAnswerPartial'
            : 'wrongAnswerPartial'
        }

        //  Set default text if none passed in from template's toHTML
        if (!hasTranslatedStrings) {
          docData.knowledgeChecks[v.ec__key].submitBtnText = 'Submit'
          docData.knowledgeChecks[v.ec__key].correctAnswerPromptText =
            'Your answer is correct'
          docData.knowledgeChecks[v.ec__key].wrongAnswerPromptText =
            'Incorrect, the correct answer is'
        }
      })

    documentTemplate.ec__requested_data.forEach((v) => {
      let disabled = ''

      const setValue =
        signedDocument &&
        signedDocument.ec__required_data &&
        signedDocument.ec__required_data.data.find(
          (dt) => dt.ec__identifier === v.ec__key
        )
      if (v.ec__type === 'ec__text_choice') {
        let enabled = ''

        let values
        const ecValues =
          setValue &&
          setValue.ec__value.length &&
          setValue.ec__value.map((v) => (v || '').trim())

        //  Handle legacy templates which used comma ',' to separate multi choice items
        if (
          ecValues &&
          ecValues.length === 1 &&
          ecValues[0].includes(',') &&
          v.ec__allow_multiple
        ) {
          //  We are making the assumption that a user's comma separated value will have a
          //  space after the comma : e.g : Choice 1, with a comma. So lets preserve
          //  all commas with a space after it

          values = ecValues[0].split(/,(?! )/g)
        } else {
          values = ecValues
        }

        if (
          completed ||
          !currentSignerRole ||
          currentSignerRole !== v.ec__signer_role
        ) {
          enabled += 'disabled'
        }

        //  Separator for choices changed from ',' to '=,'
        const options = v.ec__selection_options.split('=,')
          .map((v) => {
            const [label, val] = v.split('=')
            const value = (val || label || '').trim()
            const set = values && values.includes(value) ? 'checked' : ''

            return {
              value,
              label,
              set
            }
          })

        docData.data[v.ec__key] = {
          enabled,
          title: v.ec__title,
          multi: v.ec__allow_multiple ? 'checkbox' : 'radio',
          id: v.ec__key,
          options
        }
      } else {
        let value

        if (setValue) {
          if (v.ec__type === 'ec__boolean') {
            value += `checked="${!!setValue.ec__value}" `
          } else if (v.ec__type === 'ec__date') {
            value = setValue.ec__value
              ? `value="${moment(setValue.ec__value)
                .format('MM/DD/YYYY')}" `
              : undefined
          } else {
            value = setValue.ec__value
              ? `value="${setValue.ec__value}" `
              : undefined
          }
        }

        if (
          completed ||
          !currentSignerRole ||
          currentSignerRole !== v.ec__signer_role
        ) {
          value += ' disabled '
          disabled = ' disabled '
        }

        docData.data[v.ec__key] = {
          value,
          disabled
        }
      }
    })

    return docData
  }

  static isRtlTemplate(ec__language = '') {
    return (
      ec__language.startsWith('ar_') ||
      ec__language.startsWith('he_') ||
      ec__language.startsWith('ur_')
    )
  }

  static getStyles(ec__document_template) {
    const editorStyle = ec__document_template.ec__css || ''
    const styles = `<style>${editorStyle}</style>`

    return `
    ${styles}
    ${ec__document_template.ec__assets
    .filter((v) => v.ec__type === 'css')
    .map(
      (v) =>
        `<link rel="stylesheet" type="text/css" href="${v.ec__file.url}">`
    )
    .join('\n')}
    ${['ur_IN', 'ur_PK'].includes(ec__document_template.ec__language)
    ? `<style>
    body { font-family: 'DejaVu Serif', serif; }
    </style>`
    : ''}
    `

  }

  static processHtmlTemplate(ec__html, siteLinkedFields) {
    const regex = /\[\[\s*(\w+)\s*\]\]/g

    return _.replace(ec__html, regex, (match, propertyName) => {
      return _.has(siteLinkedFields, propertyName) ? siteLinkedFields[propertyName] : match
    })
  }

}