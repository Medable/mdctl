import req from 'request';
import res from 'response';
import _ from 'underscore';
import logger from 'logger';

const {c_task_responses, c_step_responses, c_queries , history, accounts } = org.objects,
    limit = req.query.limit || 10,
    skip = req.query.skip || 0,
    taskResposneId = req.params.taskResposneId,
    /*
    allObjects = [c_task_responses.find({_id:taskResposneId}).skipAcl().grant(6).paths('c_number').next(), 
                  ...c_step_responses.find({c_task_response:taskResposneId}).skipAcl().grant(6).paths("c_step.c_name","c_step.c_text").toArray(), 
                  ...c_queries.find({c_task_response:taskResposneId}).skipAcl().grant(6).paths('c_number', 'c_status', 'c_type').toArray()], // collect all object in one array
    */
    // ONLY SETPS FOR 1.1.0              
    allObjects = [...c_step_responses.find({c_task_response:taskResposneId}).skipAcl().grant(6).paths("c_step.c_name","c_step.c_text").toArray()], // collect all object in one array              
                  
    idArray = allObjects.map(item => {return item._id}), // get all object ids
    
    // Patch to support non zero starting seq numbers
    //firstOfEach = _.flatten(idArray.map(id => history.find({"context._id": id }).skipAcl().grant(8).sort({_id:1}).limit(1).toArray())).map(x => x._id),
    //historyObj = history.find({"context._id": {"$in":idArray}, _id: { $nin: firstOfEach } }).skipAcl().grant(8).limit(limit).skip(skip).sort({_id:-1}).toList(), // all connected histroy objects
    
    historyObj = history.find({"context._id": {"$in":idArray}, "context.sequence": {"$gt":0} }).skipAcl().grant(8).limit(1000).skip(0).sort({_id:-1}).toList(), // all connected histroy objects
    accountIds = historyObj.data.map(v => {return v.document.updater ? v.document.updater._id.toString() : ""}).filter((v, i, a) => v !== "" && a.indexOf(v) === i), // unique updater account ids
    updaterInfo = accounts.find({_id: {"$in":accountIds}}).skipAcl().grant(6).paths("c_public_identifier").toArray(); // updater account info
    
    let returnValues = [].concat(...historyObj.data.map( item => {
        
        let findObj = allObjects.find(o => {return o._id.equals(item.context._id)}) // get the object this histroy item referrs to
        let findAcc = updaterInfo.find(o => {return item.document.updater && o._id.equals(item.document.updater._id)}) // get the updater info for this histroy item 
        
        if(findAcc){
            item.document.updater.c_public_identifier = findAcc.c_public_identifier; // populate the updater info 
            delete item.document.updater.path
        }

        item.document.objectName = item.document.object.replace("c_", "").replace("_"," ");
        item.document = { new: item.document }
                function objectDiff(o1, o2){
            return Object.keys(o2).reduce((diff, key) => {
              if (o1[key] === o2[key]) return diff
              return {
                ...diff,
                [key]: o2[key]
              }
            }, {})
        }
        
        // Maybe we need to reverse the ops to be extra safe
        item.document.old = item.ops.reduce((ctx, op) => {
           
            if (op.type === consts.audits.operations.set) {
                if (_.isEqual(item.document.new[op.path], op.value)) ctx[op.path] = null;
                else ctx[op.path] = op.value;
            } else if (op.type === consts.audits.operations.push) {
                ctx[op.path].splice(ctx[op.path].indexOf(op.value), 1)
            } else if (op.type === consts.audits.operations.pull) {
                ctx[op.path].push(op.value)
            }
            
            return ctx

        }, _.clone(_.mapObject(item.document.new, _.clone))); // 1-level deep clone to prevent aliasing
        
        item.document.changed = _.intersection(_.keys(item.document.new),_.keys(item.document.old))
            .filter(k => k.startsWith('c_'))
            .filter(k => !_.isEqual(item.document.new[k],item.document.old[k]))
        
        return item.document.changed.map(k => {
            
            let ov = item.document.old[k];
            let nv = item.document.new[k];
    
            if(ov !== null){
                if(Array.isArray(ov) && ov.length === 1 && ov[0] === null){
                    ov = null
                } else if(typeof ov === 'boolean') {
                    ov = ov ? "Yes" : "No"
                } else {
                    ov = String(item.document.old[k]);
                }
            }
            
            if(nv !== null){
                if(Array.isArray(nv) && nv.length === 1 && nv[0] === null){
                    nv = null
                } else if(typeof nv === 'boolean') {
                    nv = nv ? "Yes" : "No"
                } else {
                    nv = String(item.document.new[k]);
                }
            }
                
            return {
                ...Object.assign( item.document.new, findObj),
                path: k.substring(2),
                message: item.message,
                oldValue: ov,
                newValue: nv
            }
                
        })
    }));
    
    let scriptData = {
        callouts:script.getCalloutsRemaining(),
        elapsedTime:script.getElapsedTime(),
        memFree:script.getMemoryFree(),
        memUsed:script.getMemoryUsed(),
        remaingNoti:script.getNotificationsRemaining(),
        opsLeft:script.getOpsRemaining(),
        opsUsed:script.getOpsUsed(),
        timeLeft:script.getTimeLeft()
    }
    
    //returnValues = returnValues.filter(v => v.oldValue !== '' || v.newValue !== ''); // There are odd items in the histroy list that this removes
    let data = returnValues.slice(skip, skip+limit)
    
let retObj = {
    data,
    object:"list",
    hasMore: ((skip+limit)<returnValues.length),
    count1: returnValues.length,
    count2: historyObj.data.length,
    scriptData
}

return retObj;