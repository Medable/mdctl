// let manifest
//
// // blank manifest
// manifest = {
//   includes: ['*']
// }
//
// manifest = {
//
//   // global includes
//   includes: [
//     '/^axon__nucleus_/'
//   ],
//
//   // global excludes
//   excludes: [
//     '/axon__nucleus_debug/i'
//   ],
//
//   // org environment configuration
//   env: {
//
//     // exportable or custom properties (org extension properties, account extension properties)
//     smsNumbers: {
//       includes: ['*']
//     },
//
//     // these are here for completeness but will be culled from output if empty
//     apps: [],
//     serviceAccounts: [],
//     policies: [],
//     roles: [],
//     storage: [],
//     notifications: [],
//
//     // org env configuration
//     configuration: [{
//       includes: [
//         '*'
//       ],
//       excludes: [
//         'minPasswordScore'
//       ]
//     }]
//   },
//
//   objects: {
//
//     // which objects to include?
//     includes: ['*'],
//     excludes: ['/axon__nucleus_debug/i'],
//
//     //
//     propertyIncludes: [
//       '*'
//     ],
//     propertyExcludes: [
//       '/debug/i',
//       '/axon__doc_array/'
//     ],
//
//     // object properties to include
//     properties: [{
//       name: 'org',
//       includes: [
//         '/^axon__/'
//       ],
//       excludes: [
//         '/debug/i',
//         '/axon__doc_array/'
//       ]
//     }, {
//       name: 'axon__thing'
//     }]
//   },
//
//   scripts: {
//
//     // additive includes to top-level
//     includes: [
//       '/^c_test_script/'
//     ],
//
//     // if you have to make an explicit exclude to counter additive includes
//     excludes: [
//       '/axon__nucleus_debug/i'
//     ],
//   },
//
//   views: {
//
//   },
//
//   templates: {
//
//   }
//
// }

const { privatesAccessor } = require('../../utils/privates'),
      { validateRegex, rArray } = require('../../utils/values'),
      { throwIfNot } = require('../../utils')


class Manifest {

  constructor(spec) {

    const includes = rArray((spec && spec.includes) || ['*'], true),
          excludes = rArray((spec && spec.excludes) || [], true)

    includes.every(
      value => throwIfNot('Some global include is not a regular expression', validateRegex(value, true))
    )

    excludes.every(
      value => throwIfNot('Some global exclude is not a regular expression', validateRegex(value, true))
    )

    Object.assign(privatesAccessor(this), { includes, excludes })

  }

}

module.exports = Manifest
