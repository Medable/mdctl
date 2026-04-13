import { body } from 'request';

const { c_branches, c_groups, c_group_tasks, c_steps, c_studies, c_tasks } = org.objects;

// delete existing old study - REMOVE FOR PROD VERSION
// const oldStudies = c_studies.find({c_name: '123 Test Study OKOK'}).toList().data;
// for(let i=0; i < oldStudies.length; i += 1) {
//     c_studies.deleteOne({_id: oldStudies[i]._id}).execute();
// }

function setupEntity(entity, newVals) {
    const newEntity = {
        ...entity,
        ...newVals
    };
    delete newEntity._id;
    delete newEntity.object;
    return newEntity;
}

/* START P1 */
// // import study
// let newStudy;

// if(body.data.study_id) {
//     newStudy = c_studies.updateOne({_id: body.data.study_id}, {$set: setupEntity(body.data.c_study)}).lean(false).execute();
// } else {
//     newStudy = c_studies.insertOne(setupEntity(body.data.c_study)).lean(false).execute();
// }

// // import tasks
// newStudy.c_tasks = {
//     data: body.data.c_tasks.data.map(task => c_tasks.insertOne(setupEntity(task, {
//         c_study: newStudy._id,
//         c_import_id: task._id
//     })).lean(false).execute())
// };

// // delete default groups
// const defaultGroups = c_groups.find({c_study: newStudy._id}).paths('_id').map(group => group._id);
// for(let i=0; i < defaultGroups.length; i += 1) {
//     c_groups.deleteOne({_id: defaultGroups[i]}).execute();
// }

// // import groups
// newStudy.c_groups = {
//     data: body.data.c_groups.data.map(group => c_groups.insertOne(setupEntity(group, {
//         c_study: newStudy._id,
//         c_import_id: group._id
//     })).lean(false).execute())
// };

// return {
//     ...body,
//     data: {
//         ...body.data,
//         study_id: newStudy._id
//     }
// };
/* END P1 */

/* START P2 */
// const newStudy = {
//     ...c_studies.find({_id: body.data.study_id}).next(),
//     c_tasks: {data: c_tasks.find({c_study: body.data.study_id}).map(task => task)},
//     c_groups: {data: c_groups.find({c_study: body.data.study_id}).map(group => group)}
// };

// // import group tasks
// newStudy.c_group_tasks = {data: []};
// for(let i=0; i < body.data.c_group_tasks.data.length; i += 1) {
//     const currGroupTask = body.data.c_group_tasks.data[i];

//     for(let j=0; j < newStudy.c_groups.data.length; j += 1) {
//         const currGroup = newStudy.c_groups.data[j];
//         let groupRef;
//         let assignmentRef;

//         if(String(currGroup.c_import_id) === String(currGroupTask.c_group._id)) {
//             groupRef = currGroup._id;

//             for(let k=0; k < newStudy.c_tasks.data.length; k += 1) {
//                 const currTask = newStudy.c_tasks.data[k];
//                 let flowRulesSetCount = 0;

//                 if(String(currTask.c_import_id) === String(currGroupTask.c_assignment._id)) {
//                     assignmentRef = currTask._id;
//                 }

//                 for(let l=0; l < currGroupTask.c_flow_rules.length; l += 1) {
//                     let currFlowRule = currGroupTask.c_flow_rules[l];

//                     if(String(currTask.c_import_id) === String(currFlowRule.c_dependency._id)) {
//                         currGroupTask.c_flow_rules[l] = {
//                             ...currFlowRule,
//                             c_dependency: currTask._id
//                         };
//                         flowRulesSetCount += 1;
//                         break;
//                     }
//                 }

//                 if(assignmentRef && (flowRulesSetCount === currGroupTask.c_flow_rules.length)) break;
//             }
//         }

//         if(groupRef && assignmentRef) {
//             newStudy.c_group_tasks.data.push(
//                 c_group_tasks.insertOne(setupEntity(currGroupTask, {
//                     c_group: groupRef,
//                     c_assignment: assignmentRef
//                 })).lean(false).execute()
//             );
//             break;
//         }
//     }
// }

// return {
//     ...body,
//     data: {
//         ...body.data,
//         study_id: newStudy._id
//     }
// };
/* END P2 */

function createSteps(start = 0, end) {
    if(!end) {
        end = body.data.c_steps.data.length;
    }

    const newStudy = {
        ...c_studies.find({_id: body.data.study_id}).next(),
        c_tasks: {data: c_tasks.find({c_study: body.data.study_id}).map(task => task)}
    };
    
    // import steps
    newStudy.c_steps = {data: c_steps.find({c_task: {$in: newStudy.c_tasks.data.map(task => task._id)}}).map(step => step)};
    
    let formSubSteps;
    if(Array.isArray(body.data.formSubSteps)) {
        formSubSteps = body.data.formSubSteps;
    } else {
        formSubSteps = [];
    }
    
    for(let i=start; i < end; i += 1) {
        const currStep = body.data.c_steps.data[i];
    
        for(let j=0; j < newStudy.c_tasks.data.length; j += 1) {
            let currTask = newStudy.c_tasks.data[j];
    
            if(String(currTask.c_import_id) === String(currStep.c_task._id)) {
                if(currStep.c_parent_step) {
                    formSubSteps.push(setupEntity(currStep, {
                        c_task: currTask._id,
                        c_import_id: currStep._id
                    }));
                    break;
                } else {
                    newStudy.c_steps.data.push(c_steps.insertOne(setupEntity(currStep, {
                        c_task: currTask._id,
                        c_import_id: currStep._id
                    })).lean(false).execute());
                    break;
                }
            }
        }
    }
    
    if(end === body.data.c_steps.data.length) {
        return {
            study_id: body.data.study_id,
            c_branches: body.data.c_branches,
            formSubSteps: formSubSteps
        };
    }
    return {
        study_id: body.data.study_id,
        c_branches: body.data.c_branches,
        c_steps: body.data.c_steps,
        formSubSteps: formSubSteps
    };
}

/* START P3 */
// return createSteps(0, 400);
 return createSteps(400);
/* END P3 */

/* START PHASE 4 */
// const newStudy = {
//     ...c_studies.find({_id: body.data.study_id}).next(),
//     c_tasks: {data: c_tasks.find({c_study: body.data.study_id}).map(task => task)}
// };
// newStudy.c_steps = {data: c_steps.find({c_task: {$in: newStudy.c_tasks.data.map(task => task._id)}}).map(step => step)};

// const formSubSteps = body.data.formSubSteps;

// for(let i=0; i < 300; i += 1) {
//     const currFormSubStep = formSubSteps[i];

//     for(let j=0; j < newStudy.c_steps.data.length; j += 1) {
//         const currStep = newStudy.c_steps.data[j];

//         if(String(currStep.c_import_id) === String(currFormSubStep.c_parent_step._id)) {
//             newStudy.c_steps.data.push(c_steps.insertOne({
//                 ...currFormSubStep,
//                 c_parent_step: currStep._id
//             }).lean(false).execute());
//             break;
//         }
//     }
// }

// return {
//     study_id: body.data.study_id,
//     c_branches: body.data.c_branches,
//     formSubSteps
// };
/* END PHASE 4 */

/* START PHASE 5 */
// const newStudy = {
//     ...c_studies.find({_id: body.data.study_id}).next(),
//     c_tasks: {data: c_tasks.find({c_study: body.data.study_id}).map(task => task)}
// };
// newStudy.c_steps = {data: c_steps.find({c_task: {$in: newStudy.c_tasks.data.map(task => task._id)}}).map(step => step)};

// const formSubSteps = body.data.formSubSteps;

// for(let i=300; i < formSubSteps.length; i += 1) {
//     const currFormSubStep = formSubSteps[i];

//     for(let j=0; j < newStudy.c_steps.data.length; j += 1) {
//         const currStep = newStudy.c_steps.data[j];

//         if(String(currStep.c_import_id) === String(currFormSubStep.c_parent_step._id)) {
//             newStudy.c_steps.data.push(c_steps.insertOne({
//                 ...currFormSubStep,
//                 c_parent_step: currStep._id
//             }).lean(false).execute());
//             break;
//         }
//     }
// }

// return {
//     study_id: body.data.study_id,
//     c_branches: body.data.c_branches
// };
/* END PHASE 5 */

// function createBranches(start = 0, end) {
//     if(!end) {
//         end = body.data.c_branches.data.length;
//     }

//     const newStudy = {
//         ...c_studies.find({_id: body.data.study_id}).next(),
//         c_tasks: {data: c_tasks.find({c_study: body.data.study_id}).map(task => task)}
//     };
//     newStudy.c_steps = {data: c_steps.find({c_task: {$in: newStudy.c_tasks.data.map(task => task._id)}}).map(step => step)};

//     // import branches
//     newStudy.c_branches = {data: []};
//     for(let i=start; i < end; i += 1) {
//         const currBranch = body.data.c_branches.data[i];
//         let taskRef;
//         let defaultDestinationRef;
//         let triggerRef;

//         if(!taskRef) {
//             for(let j=0; j < newStudy.c_tasks.data.length; j += 1) {
//                 const currTask = newStudy.c_tasks.data[j];

//                 if(String(currTask.c_import_id) === String(currBranch.c_task._id)) {
//                     taskRef = currTask._id;
//                     break;
//                 }
//             }
//         }

//         if(!defaultDestinationRef || !triggerRef) {
//             for(let j=0; j < newStudy.c_steps.data.length; j += 1) {
//                 const currStep = newStudy.c_steps.data[j];

//                 if(String(currStep.c_import_id) === String(currBranch.c_default_destination._id)) {
//                     defaultDestinationRef = currStep._id;
//                 }

//                 if(String(currStep.c_import_id) === String(currBranch.c_trigger._id)) {
//                     triggerRef = currStep._id;
//                 }

//                 if(defaultDestinationRef && triggerRef) break;
//             }
//         }

//         if(taskRef && defaultDestinationRef && triggerRef) {
//             for(let j=0; j < newStudy.c_steps.data.length; j += 1) {
//                 const currStep = newStudy.c_steps.data[j];

//                 for(let k=0; k < currBranch.c_conditions.length; k += 1) {
//                     const currCondition = currBranch.c_conditions[k];
//                     const newCondition = {...currCondition};

//                     if(String(currStep.c_import_id) === String(currCondition.c_selector._id)) {
//                         newCondition.c_selector = currStep._id;
//                         currBranch.c_conditions[k] = newCondition;
//                     }

//                     if(String(currStep.c_import_id) === String(currCondition.c_destination._id)) {
//                         newCondition.c_destination = currStep._id;
//                         currBranch.c_conditions[k] = newCondition;
//                     }
//                 }
//             }

//             newStudy.c_branches.data.push(c_branches.insertOne(setupEntity(currBranch, {
//                 c_task: taskRef,
//                 c_default_destination: defaultDestinationRef,
//                 c_trigger: triggerRef
//             })).lean(false).execute());
//         }
//     }

//     return {
//         study_id: body.data.study_id,
//         c_branches: body.data.c_branches
//     };
// }

/* START PHASE 6 */
// return createBranches(1, 2);
/* END PHASE 6 */

/* START PHASE 7 */
// return createBranches(2, 3);
/* END PHASE 7 */

/* START PHASE 8 */
// return createBranches(3, 4); // crash
/* END PHASE 8 */

/* START PHASE 8 */
// return createBranches(4, 5);
/* END PHASE 8 */

/* START PHASE 9 */
// return createBranches(5, 6);
/* END PHASE 9 */

/* START PHASE 10 */
// return createBranches(6, 7);
/* END PHASE 10 */

/* START PHASE 11 */
// return createBranches(7, 8);
/* END PHASE 11 */