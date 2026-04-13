/***********************************************************

@script     Axon - Fetch Air Quality Data

@brief      Trigger to fetch air quality for a location response

@author     Nico Ricci     

@version    4.2.2

(c)2016-2014 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/


import http from 'http'

const {sin, cos, atan2, sqrt, PI} = Math
const deg2rad = deg => deg * (PI/180)

// Calculate the shortest distance (in km) over the earth’s surface between the two points
function distance(lat1,lon1,lat2,lon2) {
    // earth's radius    
    var R = 6371
    var dLat = deg2rad(lat2-lat1)
    var dLon = deg2rad(lon2-lon1)
    var a = sin(dLat/2) * sin(dLat/2) +
            cos(deg2rad(lat1)) * cos(deg2rad(lat2)) * 
            sin(dLon/2) * sin(dLon/2)
    var c = 2 * atan2(Math.sqrt(a), sqrt(1-a))
    var d = R * c
    return d
}

const { c_step_response: stepResponse, c_step: s } = org.objects,
      { _id, type, c_value: value, c_step: step } = script.context,
      endpoint = 'https://api.waqi.info',
      apiToken = 'bb871d71c6ed9758cd8604e614ca17857365a8ad',
      stepCursor = s.find({_id: step._id, c_get_air_quality_data: true}).skipAcl().grant(4)

if (type === 'c_location' && stepCursor.hasNext()) {
    const [ long, lat ] = value.coordinates,
          req = http.get(`${endpoint}/feed/geo:${lat};${long}/?token=${apiToken}`),
          { status, data } = JSON.parse(req.body)

    if(status === 'ok') {
        const [ mlat, mlong ] = data.city.geo;
        data.measurement_distance = distance(lat,long,mlat,mlong).toFixed(2)
        stepResponse.updateOne({_id},{$set: {c_data: data}}).grant(7).lean(false).execute()
    }
}