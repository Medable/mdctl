import notifications from 'notifications'
import { computeDueParticipants, getValidatedStudyConfig } from 'c_pi_oversight_lib'
import logger from 'logger'

const { accounts, c_studies } = org.objects

// unknown statuses will use the default style (black text)
const statusStyles = {
  'review required': 'background: #FEF9C3;color: #713F12;border: 1px solid #FEF08A;',
  overdue: 'background: #FEE2E2;color: #B91C1C;border: 1px solid #FECACA;'
}

function getSitePIs(siteId) {
  const piRole = consts.roles.c_axon_site_investigator
  return accounts
    .find({ c_site_access_list: siteId, roles: { $in: [piRole] } })
    .skipAcl()
    .grant('read')
    .toArray()
}

function sendDigest({ siteId, studyId, lumosUrl }) {
  const config = getValidatedStudyConfig(studyId)
  if (config.reviewDueWeeks === 0) {
    logger.info(`PI Oversight digest: Skipping digest for study ${studyId} - reviewDueWeeks is 0 (reviews never due)`)
    return []
  }

  const pis = getSitePIs(siteId)

  if (!pis || pis.length === 0) {
    logger.info(`PI Oversight digest: No PIs found for site ${siteId}`)
    return
  }

  // Fetch study name and site name
  const study = c_studies
    .readOne({ _id: studyId })
    .paths('c_name')
    .skipAcl()
    .grant('read')
    .execute()
  const studyName = (study && study.c_name) || 'Unknown Study'

  const site = org.objects.c_sites
    .readOne({ _id: siteId })
    .paths('c_name')
    .skipAcl()
    .grant('read')
    .execute()
  const siteName = (site && site.c_name) || 'Unknown Site'

  // Get all participants (no limit for digest)
  const result = computeDueParticipants({ siteId, studyId, limit: 10000, skip: 0 })

  // computeDueParticipants returns an array with single element
  const resultData = result[0] || { data: [], totalCount: 0, hasMore: false }

  // Filter out 'Current' status participants
  const all = []
  if (resultData && resultData.data) {
    resultData.data.forEach(function(p) {
      if (p.status !== 'Current') {
        let style = 'border-radius:6px;padding:4px 10px;margin-left:8px;'
        const statusKey = (p.status || '').toLowerCase()
        if (statusStyles[statusKey]) {
          style += statusStyles[statusKey]
        }

        all.push({
          id: p.participantId,
          c_number: p.participantNumber,
          status: p.status,
          style: style
        })
      }
    })
  }

  pis.forEach((pi, index) => {
    try {
      const payload = {
        pi_name: pi.name.first + ' ' + pi.name.last,
        study_name: studyName,
        site_name: siteName,
        participants: all,
        signin_url: lumosUrl
      }

      const locale = (pi.locale || 'en_US').replace('-', '_')
      notifications.send('c_pi_oversight_digest', payload, { recipient: pi._id, locale: locale })

      logger.info('[' + (index + 1) + '/' + pis.length + '] Notification sent successfully to ' + pi.email)
    } catch (err) {
      logger.error('Failed to send notification to PI ' + pi._id + ': ' + (err.message || err))
      throw err
    }
  })

  // Return all participants for testing and debugging
  return all
}

module.exports = { sendDigest }