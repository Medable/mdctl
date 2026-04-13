/*
 * PI Oversight - Digest Scheduler Job
 * Runs on a cron to send digest emails to PIs for each site
 * where PI Oversight is enabled (each org has one study).
 */

import config from 'config'
import logger from 'logger'
import { sendDigest } from 'c_pi_oversight_digest'
import { getValidatedStudyConfig } from 'c_pi_oversight_lib'

const { c_studies, c_public_users } = org.objects

logger.info('=== PI Oversight Digest Cron Job Started ===')

function getLumosBaseUrl() {
  const configData = config.get('axon__siteapp_studio_urls') || {}
  const { siteAppUrls } = configData
  const envHost = script.env.host

  logger.info(`Looking for Lumos URL for environment: ${envHost}`)
  logger.info(`Available site app URLs: ${JSON.stringify(siteAppUrls)}`)

  const match = siteAppUrls.find(v => v.env === envHost)
  const url = (match && match.url)

  logger.info(`Lumos base URL: ${url || 'NOT FOUND'}`)
  return url
}

function findSitesForStudy(studyId) {
  logger.info(`Finding sites for study: ${studyId}`)

  // Distinct site ids with participants in this study
  // Using Cortex aggregation builder methods
  const rows = c_public_users
    .aggregate()
    .match({ 'c_study._id': studyId })
    .group({ _id: 'c_site._id' })
    .skipAcl()
    .grant('read')
    .toArray()

  // Extract actual site IDs from the grouped results
  // Each row has { _id: { _id: actualSiteId } }
  const siteIds = rows
    .map(r => {
      logger.info(`Processing row: ${JSON.stringify(r)}`)
      // The group by c_site._id returns { _id: siteObjectWithId }
      return r._id && r._id._id ? r._id._id : r._id
    })
    .filter(Boolean)

  return siteIds
}

const lumosUrl = getLumosBaseUrl()

const study = c_studies
  .find({ c_pi_oversight_enabled: true })
  .paths('_id', 'c_name')
  .skipAcl()
  .grant('read')
  .limit(1)
  .toArray()

if (!study.length) {
  return { skipped: true, reason: 'PI Oversight not enabled for any study' }
}

const studyObj = study[0]
const studyId = studyObj._id

// Get validated configuration (ensures intervalWeeks is a valid integer >= 1)
const studyConfig = getValidatedStudyConfig(studyId)
const intervalWeeks = studyConfig.emailIntervalWeeks

// Calculate current week number (weeks since epoch)
const nowUtc = new Date()
const weeksSinceEpoch = Math.floor(nowUtc.getTime() / (7 * 24 * 60 * 60 * 1000))

// Only send if current week is divisible by interval
// This ensures consistent weekly/bi-weekly/etc schedule
if (weeksSinceEpoch % intervalWeeks !== 0) {
  return { skipped: true, reason: `Week ${weeksSinceEpoch} not divisible by interval ${intervalWeeks}` }
}

const siteIds = findSitesForStudy(studyId)

if (siteIds.length === 0) {
  return { skipped: true, reason: 'No sites with participants' }
}

let successCount = 0
let errorCount = 0

siteIds.forEach((siteId, index) => {
  try {
    sendDigest({ siteId, studyId, lumosUrl })
    successCount++
    logger.info(`[${index + 1}/${siteIds.length}] Digest sent successfully for site: ${siteId}`)
  } catch (err) {
    errorCount++
    logger.error(`Failed to send digest for site ${siteId}: ${err.message || err}`)
  }
})

return {
  ok: true,
  sentAt: nowUtc,
  intervalWeeks,
  week: weeksSinceEpoch,
  totalSites: siteIds.length,
  successCount,
  errorCount
}