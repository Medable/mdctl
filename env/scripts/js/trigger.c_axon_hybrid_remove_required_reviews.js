/***********************************************************

@script     Axon - Hybrid - Remove required reviews

@brief		Remove required reviews when deleted

@author     Nahuel Dealbera     (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import logger from 'logger'
import _ from 'underscore'
import { id }from 'util';

//detects if a review type went from active to inactive
const getNewInactiveReviewType = (newReviewTypes, oldReviewTypes) => _.chain(newReviewTypes)
            .filter((newReviewType, idx) => {
                return newReviewType.hasOwnProperty('c_active') &&
                        !newReviewType.c_active &&
                          oldReviewTypes[idx].hasOwnProperty('c_active')
                            && oldReviewTypes[idx].c_active
            })
            .first()
            .value()

//update group task c_required_reviews  
const updateGroupTaskWith = (id, requiredReviews) => org.objects
                .c_group_tasks
                .updateOne({ _id: id }, {
                    $set: { c_required_reviews: requiredReviews }
                })
                .execute()

//main method
const removeInactiveReviewTypes = inactiveReviewTypeId => org.objects
    .c_group_tasks
    .find()
    .skipAcl()
    .grant(consts.accessLevels.delete)
    .limit(1000)
    .toArray()
    .filter(groupTask => groupTask.c_required_reviews.length > 0)
    .forEach(groupTask => {
        const requiredReviews = groupTask.c_required_reviews
        if(id.inIdArray(requiredReviews, inactiveReviewTypeId)) {
            const modifiedRequiredReviews = requiredReviews
                                                .filter(r => !id.equalIds(r, inactiveReviewTypeId))
                                                
            updateGroupTaskWith(groupTask._id, modifiedRequiredReviews)
        }
    })
    
const didReviewTypesChange = scriptArgs => _(scriptArgs.modified).contains('c_review_types')

if(didReviewTypesChange(script.arguments)) {
    const newReviewTypes = script.arguments.new.c_review_types
    const oldReviewTypes = script.arguments.old.c_review_types

    const newInactiveReviewType = getNewInactiveReviewType(newReviewTypes, oldReviewTypes)
    
    newInactiveReviewType && 
        removeInactiveReviewTypes(newInactiveReviewType._id)
}