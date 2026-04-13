import request from 'request';
import response from 'response';
import nucUtils from 'c_nucleus_utils';

const studyId = request.params.studyId,
    { c_visit_schedule, c_visits, c_groups, c_group_tasks, c_tasks } = org.objects,
    tasks = c_tasks.find({c_study:studyId}).skipAcl().grant(consts.accessLevels.read).limit(500).paths(["c_name"]).toArray(), // get the names of all tasks
    visitSchedule = request.body.data;

// if(c_visit_schedule.find({c_study:studyId}).skipAcl().grant(consts.accessLevels.read).count() > 0){
//     const message = "For safety, this script can only import a visit schedule in study where none exists."
//     response.setStatusCode(500);
//     response.write(message);
//     return new Error(message);
// }

let visits = [];
let groups = [];
let assignemnts = [];


let visSch = {
	c_name: visitSchedule.c_name,
	c_study: studyId
}

let newVisitSchedule = c_visit_schedule.insertOne(visSch).skipAcl().grant(consts.accessLevels.update).lean(false).execute();// create visit schedule

visitSchedule.c_visits.data.forEach(visit => {

	let createVis = {
		c_name: visit.c_name,
		c_schedule: visit.c_schedule,
		c_visit_schedules:[newVisitSchedule._id]
	};

    visits.push(createVis);
    
    let newVisit = c_visits.insertOne(createVis).skipAcl().grant(consts.accessLevels.update).lean(false).execute();// create visit

	visit.c_groups.data.forEach(group => {
		let createGroup = {
			c_name: group.c_name,
			c_visits:[newVisit._id]
		};
        
        groups.push(createGroup);
        
		let newGroup = c_groups.insertOne(createGroup).skipAcl().grant(consts.accessLevels.update).lean(false).execute();// create group
        
        let groupTasksCreateList = [];
		group.c_group_tasks.data.forEach(group_task => {
			let newTask = tasks.find(task => { return task.c_name === group_task.c_assignment.c_name});
			
			let createTaskAssignment = {
				c_notification_times:[],
				c_notification_active:false,
				c_assignment:newTask._id,
				c_schedule:group_task.c_schedule,
				c_group:newGroup._id
			}
			
			groupTasksCreateList.push(createTaskAssignment);
			assignemnts.push(createTaskAssignment);

		});
		
		c_group_tasks.insertMany(groupTasksCreateList).skipAcl().grant(consts.accessLevels.update).execute();

	});

});

var info = {
    getOpsUsed: script.getOpsUsed(),
    getOpsRemaining: script.getOpsRemaining(),
    getElapsedTime: script.getElapsedTime(),
    getTimeLeft: script.getTimeLeft(),
    getCalloutsRemaining: script.getCalloutsRemaining(),
    getNotificationsRemaining: script.getNotificationsRemaining(),
}

let retVal = {
    visSch,
    visits,
    groups,
    assignemnts,
    info
}

return retVal;