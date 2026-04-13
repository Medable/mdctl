import faults from 'c_fault_lib'

const { ReviewTab, SiteTab } = require('c_dmweb_transforms_lib'),
      { query = {}, params: { tabName, type } } = require('request')

const tabs = {
  review_tab_info: new ReviewTab(),
  site_tab_info: new SiteTab()
}

const tab = tabs[tabName]

if (!tab) {
  faults.throw('axon.unsupportedOperation.notImplemented')
}

if (type === 'schema') {
  return tab.getDefaultSchema()
} else if (type === 'data') {
  return tab.getCursor(query)
} else {
  faults.throw('axon.unsupportedOperation.notImplemented')
}