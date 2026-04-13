//import logger from 'logger';
import _ from 'underscore';
import { paths } from 'util';
import cache from 'cache';

// Utils ----------------------------

// Translate type identifier
const _tr = s => s.toLowerCase().replace('[]','');

const _ident = value => value;

const _omit = x => {};

const _file = function (value, key) {
    return {content: `facet://${this.sourceObj[key].path}`};
};

const _ref = function (value, key) {
    return {_id: this.idMap[this.sourceObj[key]._id]};
};

const _doc = function (value, key) {
    let subSchema = this.schema[this.key].properties;
    let doc = _.mapObject(value, _copy, {schema: subSchema, sourceObj: value, idMap: this.idMap});
    doc = _.omit(doc, v => v === null || v === undefined);
    return doc;
};

// Copying Funcitons 
const copiers = {
    boolean: _ident,
    date: _ident,
    string: _ident,
    number: _ident,
    objectid: _omit,
    file: _file,
    reference: _ref,
    document: _doc
};

const _copy = function (value, key) {
    
    if(!key.startsWith('c_')) return null;
    //logger.info(`${key} - ${this.schema} `);
    
    if(paths.to(this, `dataOverride.${key}`))
        return this.dataOverride[key];
    
    let prop = this.schema[key];
    if(prop.type === 'Reference[]') return null;
    
    let copier = copiers[_tr(prop.type)]
    if(!prop.array) {
        return copier.call(this, value, key);
    } else {
        return _.map(value, copier, _.extend(this, { key }))
            .filter(x => x !== null && x !== undefined);
    }
        
};

function getSchema(type) {
    let { schema, ETag } = cache.get(`getSchema:${type}`) || {};
    let currETag = require('schemas').read(type,'ETag');
    if (!schema || currETag !== ETag) {
        let { properties, ETag } = require('schemas').read(type);
        logger.info(`${type} props1: ${properties}`);
        schema = Object.assign({}, ...properties.map(p => ({[p.name]: p})));
        schema = _.mapObject(schema, prop => {
            if(!prop.type.startsWith('Document'))     
                return prop;
            logger.info(`${type} props2: ${prop.name}`);
            prop.properties = Object.assign({}, ...(prop.properties || []).map(p => ({[p.name]: p})));
            return prop;
        });
        cache.set(`getSchema:${type}`, { schema, ETag }); 
    }
    return schema;
}

// Actual Work ------------------------------------

function cloneStep(templateId, dataOverride, context) {
    //logger.info('Clone Step');
    let stepSchema = getSchema('c_step'); 
    const sourceObj = org.objects.c_step
        .find({_id: templateId})
        .paths(require('schemas').read('c_step','properties.name'))
        .skipAcl(true)
        .grant(7)
        .next();
    
    let copy = _.mapObject(sourceObj, _copy, {schema: stepSchema, sourceObj, idMap: context});
    copy = _.omit(copy, v => v === null || v === undefined);
    
    let newStepId = org.objects.c_step.insertOne(copy).execute();
    
    _.extend(context, {[sourceObj._id]: newStepId});
    org.objects.c_step
        .find({'c_parent_step._id': templateId})
        .skipAcl(true)
        .grant(7)
        .forEach(step => {
            cloneStep(step._id, {}, context);
        });
    
    return newStepId;
}

function cloneBranch(templateId, dataOverride, context) {
    //logger.info('Clone Branch');
    let branchSchema = getSchema('c_branch'); 
    const sourceObj = org.objects.c_branch
        .find({_id: templateId})
        .paths(require('schemas').read('c_branch','properties.name'))
        .skipAcl(true)
        .grant(7)
        .next();
    
    let copy = _.mapObject(sourceObj, _copy, {schema: branchSchema, sourceObj, idMap: context});
    copy = _.omit(copy, v => v === null || v === undefined);
    
    let newBranchId = org.objects.c_branch.insertOne(copy).execute();
    return newBranchId;
}

function cloneTask(templateId, dataOverride) {
    let taskSchema = getSchema('c_task');
    const sourceObj = org.objects.c_task
        .find({_id: templateId})
        .paths(require('schemas').read('c_task','properties.name'))
        .skipAcl(true)
        .grant(7)
        .next();
    
    let copy = _.mapObject(sourceObj, _copy, {schema: taskSchema, sourceObj, idMap: {}, dataOverride});
    copy = _.extend(copy, dataOverride);
    copy = _.omit(copy, v => v === null || v === undefined);
    
    copy.c_cloning_flag = true;
    let newTaskId = org.objects.c_task.insertOne(copy).execute();
    let ctx = {[sourceObj._id]: newTaskId};
    
    // Copy Steps and Sub-Steps
    org.objects.c_step
        .find({'c_task._id': templateId, c_parent_step: null})
        .skipAcl(true)
        .grant(7)
        .forEach(step => {
            cloneStep(step._id, {}, ctx);
        });
 
    // Copy Branches
    org.objects.c_branch
        .find({'c_task._id': templateId})
        .skipAcl(true)
        .grant(7)
        .forEach(branch => {
            cloneBranch(branch._id, {}, ctx);
        });
    
    return newTaskId;
}



let {dataOverride, templateId, studyId } = require('request').body;

if(!templateId)
    throw {code: 'kInvalidArgument', reason: 'Template Id must be supplied.'}
    
if(!studyId)
    throw {code: 'kInvalidArgument', reason: 'Study Id must be supplied.'}

let _dataOverride = _.clone(dataOverride) || {};
_dataOverride.c_study = {_id: studyId};
 
//logger.info(`tt data = ${JSON.stringify(dataOverride)}`);
let _id = cloneTask(templateId, _dataOverride);
return org.objects.c_task.find({_id}).next();