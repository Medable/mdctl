import nq from 'c_nucleus_query';


const lift = o => k => o[k];
const trans = (obj, prop) => Object.assign({}, ...org.objects[obj].find().map(s => ({ [s._id]: s[prop] })));

let sm = trans('c_step','c_name')

function getTR(tr) {
    let srs = org.objects.c_step_response
        .find({c_task_response: tr._id})
        //.expand('c_step')
        .paths(['c_value','c_step.c_cf_cdash_mapping'])
        .toArray();

    return Object.assign(tr, {
        //id: tr._id,
        c_task: tr.c_task.c_name,
        steps: Object.assign({}, ...srs.map(sr => {
            let key = `${sr._id} | ${new String(sr.c_step.c_cf_cdash_mapping).padStart(10)} | ${new String(sr.c_step._id)} | ${new String(lift(sm)(sr.c_step._id)).padStart(30).substring(0,30)} |`
            return { [key]: sr.c_value }
        })),
        queries: org.objects.c_query
            .find({ c_type: 'system', c_task_response: tr._id })
            .expand(['c_query_rule','c_task_response'])
            .paths(['c_number','c_query_rule.c_name','c_task_response.c_number','c_status','c_description'])
            .map(({
                c_number: q_number,
                c_query_rule: { c_name: rule },
                c_task_response: { c_number: tr_number },
                c_status: status,
                c_description: msg
            }) => `${tr_number} - ${q_number} - ${rule} - ${status} = ${msg}`)
    })      
}

function report(subjectNumber) {
    const { _id: c_public_user } = org.objects.c_public_user.find({c_number: subjectNumber}).paths('_id').next()
    let trs = org.objects.c_task_response
        .find({ c_public_user })
        .paths(['_id', 'c_inactive', 'c_status', 'c_inactive', 'c_task.c_name'])
        .toArray()
        
    return trs.map(tr => getTR(tr))
}

function clearQueries(subjectNumber) {
    const { _id: c_subject } = org.objects.c_public_user.find({c_number: subjectNumber}).paths('_id').next()
    return org.objects.c_query.deleteMany({ c_subject, c_type: 'system' }).execute();
}

function clearSubject(subjectNumber) {
    const { _id: c_subject } = org.objects.c_public_user.find({c_number: subjectNumber}).paths('_id').next(),
        cT = org.objects.c_task.find({c_name: 'Patient Consent'}).paths('_id').next(),
        cS = org.objects.c_step.find({c_task: cT._id}).paths('_id').toArray();
        
    let x = org.objects.c_task_response.deleteMany({ c_public_user: c_subject, c_task: {$ne: cT._id } }).execute();    
    x += org.objects.c_step_response.deleteMany({ c_public_user: c_subject, c_step: {$nin: cS.map(x =>x._id)} }).execute();        
    x += org.objects.c_query.deleteMany({ c_subject }).execute();
    
    return x
}


function evalAll(subjectNumber) {
    const { _id: c_public_user } = org.objects.c_public_user.find({c_number: subjectNumber}).paths('_id').next()
    return org.objects.c_task_response.find({c_public_user}).toArray().forEach(tr => {
        nq.checkQueries(tr);    
    });
}

function evalTR(trid) {
    //const { _id: c_public_user } = org.objects.c_public_user.find({c_number: subjectNumber}).paths('_id').next()
    return org.objects.c_task_response.find({_id: trid}).toArray().forEach(tr => {
        nq.checkQueries(tr);    
    });
}

function evalRule(rule, trid) {
    let { _id: trId, c_task: { _id: tId }, c_public_user: { _id: puId }} = org.objects.c_task_response.find({_id: trid}).next();
    //let rule = org.objects.c_query_rule.find({c_name}).next();
    return nq.evalExpr.call({trId,tId,puId}, rule);
}

function getRule(c_name) {
    return org.objects.c_query_rule.find({c_name}).next();
}

function isCrossForm(rule) {
    return nq.getters(rule.c_rules).some(g => g.isCrossForm)
}


module.exports = {
    evalTR,
    clearSubject,
    isCrossForm,
    report,
    getRule,
    evalRule,
    clearQueries,
    evalAll
}