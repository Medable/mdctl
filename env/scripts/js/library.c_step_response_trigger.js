/***********************************************************
library.c_step_response
@script     Axon - Step Response Triggers Library

@brief      Library that contains triggers associated with Step Responses

@author     Ugochukwu Nwajagu

@version    1.0.0

(c)2016-2021 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import http from 'http'
const { trigger, log } = require('decorators')

// cache.set('airquality_enabled', true)
const { sin, cos, atan2, sqrt, PI } = Math
const deg2rad = deg => deg * (PI / 180)
const { c_step: s } = org.objects,
      endpoint = 'https://api.waqi.info',
      apiToken = 'bb871d71c6ed9758cd8604e614ca17857365a8ad'

// Calculate the shortest distance (in km) over the earth’s surface between the two points
function distance(lat1, lon1, lat2, lon2) {
  // earth's radius
  const R = 6371
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a = sin(dLat / 2) * sin(dLat / 2) +
            cos(deg2rad(lat1)) * cos(deg2rad(lat2)) *
            sin(dLon / 2) * sin(dLon / 2)
  const c = 2 * atan2(Math.sqrt(a), sqrt(1 - a))
  const d = R * c
  return d
}

class StepResponseTrigger {

  @log({ traceError: true })
  @trigger('create.after', {
    object: 'c_step_response',
    if: {
      $and: [
        {
          $cache: 'airquality_enabled'
        },
        {
          $eq: [
            '$$ROOT.type',
            'c_location'
          ]
        }
      ]
    }
  })
  static afterStepCreate({ context }) {
    const stepCursor = s.find({ _id: context.c_step._id, c_get_air_quality_data: true })
      .skipAcl()
      .grant(4)
    if (stepCursor.hasNext()) {
      const [long, lat] = context.c_value.coordinates,
            req = http.get(`${endpoint}/feed/geo:${lat};${long}/?token=${apiToken}`),
            { status, data } = JSON.parse(req.body)

      if (status === 'ok') {
        const [mlat, mlong] = data.city.geo

        data.measurement_distance = distance(lat, long, mlat, mlong)
          .toFixed(2)

        org.objects.c_step_response.updateOne({ _id: context._id }, { $set: { c_data: data } })
          .skipAcl()
          .grant(consts.accessLevels.update)
          .execute()
      }
    }
  }

}

module.exports = StepResponseTrigger