import req from 'request'
import { ensureEnabled } from 'c_pi_oversight_lib'
import { sendDigest } from 'c_pi_oversight_digest'
import logger from 'logger'

const { siteId, studyId, lumosUrl } = req.body

ensureEnabled(studyId)

if (!siteId || !studyId) {
  logger.error('PI Oversight digest send failed: siteId and studyId are required')
  throw Object.assign(new Error('siteId and studyId are required'), { code: 'kInvalidArgument', statusCode: 400 })
}

sendDigest({ siteId, studyId, lumosUrl })

return { ok: true }