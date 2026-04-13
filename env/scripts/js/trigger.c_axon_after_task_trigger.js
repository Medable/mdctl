if(script.arguments.new.c_cloning_flag)
    return;

if(script.arguments.new.c_type === 'consent' || script.arguments.new.c_type === 'nucleus_consent') {
    const Tasks = org.objects.c_tasks;
    const Steps = org.objects.c_steps;

    Steps.insertOne({
        c_name: 'Consent Review',
        c_order: 0,
        c_task: script.arguments.new._id,
        c_type: 'consent_review'
    }).execute();
}