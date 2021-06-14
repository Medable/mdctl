/**
 * reference-map.js
 * Tools that read object definitions and help object builders build better
 * objects.
 *
 * Object enumeration parsing isn't utilized but could be used to provide better
 * setters.
 */

import glob from 'glob'

const CHILD_REFERENCE_MAP = {}
const OBJECT_ENUMERATIONS = {}

const objectDefinitions = glob.sync(`${process.cwd()}/configuration/env/objects/*.json`)
  .map(filename => require(filename))

objectDefinitions.forEach(({ name: childType, properties }) => {
  properties
    .filter(p => p.type === 'ObjectId' || p.type === 'Reference')
    .forEach(({ sourceObject: parentType, name: childProperty }) => {
      if (!CHILD_REFERENCE_MAP[parentType]) {
        CHILD_REFERENCE_MAP[parentType] = {}
      }
      if (!CHILD_REFERENCE_MAP[parentType][childType]) {
        CHILD_REFERENCE_MAP[parentType][childType] = childProperty
        return
      }
      if (!Array.isArray(CHILD_REFERENCE_MAP[parentType][childType])) {
        CHILD_REFERENCE_MAP[parentType][childType] = [CHILD_REFERENCE_MAP[parentType][childType]]
      }
      CHILD_REFERENCE_MAP[parentType][childType].push(childProperty)
    })
})

objectDefinitions.forEach(({ name: objectType, properties }) => {
  OBJECT_ENUMERATIONS[objectType] = {}
  properties.filter(p => p.type === 'String')
    .filter(p => p.validators.some(v => v.name === 'stringEnum' && v.definitions))
    .forEach(({ name: property, validators }) => {
      let enumerations = validators
        .find(v => v.name === 'stringEnum')
        .definitions
        .values

      OBJECT_ENUMERATIONS[objectType][property] = enumerations
    })
})

function getChildProperty(parentType, childType) {
  let property = CHILD_REFERENCE_MAP[parentType][childType]
  return Array.isArray(property)
    ? undefined
    : property
}

export {
  CHILD_REFERENCE_MAP,
  OBJECT_ENUMERATIONS,
  getChildProperty
}