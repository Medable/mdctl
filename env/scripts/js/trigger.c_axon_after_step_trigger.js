import objects from 'objects';
import logger from 'logger';

if(script.arguments.new.c_task) {
    const Steps = org.objects.c_steps;
    
    const task = objects.read('c_tasks', script.arguments.new.c_task, {
        paths: ['_id', 'c_type']
    });
    
    if(task.c_type === 'consent' || task.c_type === 'nucleus_consent') {
         // This can handle both 'consent' and
         // 'nucleus_consent' steps ordering.
        const steps = Steps.find({c_task: task._id})
            .sort({c_order: 1})
            .limit(1000)
            .toList();
        
        let lastStep = steps.data[steps.data.length - 1];
        
        if(lastStep.c_type === 'consent_review') 
            return; 
        
        steps.data.splice(steps.data.length - 1, 1);
        
        // Bubble-up step to its final position without
        // braaking any ordering rule
        let i = 0;
        while(i < steps.data.length) {
            let currType = steps.data[i].c_type;  
            
            if(currType === 'consent_review')
                break;
                
            if(currType === 'initials' && (
                lastStep.c_type === 'nucleus_question_review' || 
                lastStep.c_type === 'document_section'))
                break;
            
            if(currType === 'nucleus_question_review' &&  
                lastStep.c_type === 'document_section')
                break;
            
            i++;
        }
        
        steps.data.splice(i, 0, lastStep);
        steps.data.forEach((x, index) => {
            Steps.updateOne({_id: x._id}, {
                $set: { c_order: index }
            }).execute();
        });
    }
}