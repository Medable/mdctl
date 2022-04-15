const mappings = require('..')

module.exports = class ReviewsTypesMap {

  constructor(org) {
    this.org = org
  }

  async getExistingStudy() {
    let study = {}

    const [currentStudy] = await this.org
      .objects
      .c_study
      .find()
      .paths('c_review_types', 'c_key')
      .limit(1)
      .toArray()

    if (currentStudy) {
      study = currentStudy
    }

    return study
  }

  async getStudyReviewMaps() {
    const mapping = [],
          currentStudy = await this.getExistingStudy()

    let reviewTypes = currentStudy.c_review_types || []
    // get only the active ones
    // eslint-disable-next-line camelcase
    reviewTypes = reviewTypes.filter(({ c_active }) => c_active)

    if (reviewTypes.length === 0) return mapping

    // eslint-disable-next-line no-restricted-syntax
    for (const reviewType of reviewTypes) {

      const roles = reviewType.c_roles,

            // eslint-disable-next-line no-await-in-loop
            [{ roles: currentRoles }] = await this.org
              .objects
              .org
              .find()
              .paths('roles')
              .limit(1)
              .toArray(),

            roleCodes = roles
              .map((roleId) => {
                const role = currentRoles.find(({ _id }) => (_id === roleId))
                return role && role.code
              })

      // if there is an invalid roleCode simply ignore this review type
      // eslint-disable-next-line no-continue
      if (roleCodes.some(role => !role)) continue

      mapping.push({
        path: `c_study.${currentStudy.c_key}.c_review_types.${reviewType.c_key}.c_roles`,
        mapTo: {
          $dbNext: {
            expressionPipeline: [
              {
                $transform: {
                  each: {
                    in: {
                      $map: {
                        as: 'role',
                        in: {
                          $pathTo: [
                            '$$role',
                            '_id'
                          ]
                        },
                        input: {
                          $filter: {
                            as: 'role',
                            cond: {
                              $in: [
                                '$$role.code',
                                {
                                  $array: roleCodes.map(code => ({ $literal: code }))
                                }
                              ]
                            },
                            input: '$$ROOT.roles'
                          }
                        }
                      }
                    }
                  }
                }
              }
            ],
            maxTimeMS: 10000,
            object: 'org',
            operation: 'cursor',
            paths: [
              'roles'
            ]
          }
        }
      })

    }

    return mapping
  }

  async getMappings() {
    return [
      ...await this.getStudyReviewMaps()
    ]
  }


}
