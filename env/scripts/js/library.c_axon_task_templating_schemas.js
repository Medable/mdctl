const assert = (x, msg) => {
    if(!x)
        throw({fault:"kError", reason: "Assertion Error", message:msg});
}


const test = function (id1, id2) {
    
    const [ t1, t2 ] = [id1, id2].map(_id => org.objects.c_task
        .find({_id})
        .paths(require('schemas').read('c_task','properties.name'))
        .skipAcl(true)
        .grant(7)
        .next());
    
    assert(t1.c_name === t2.c_name);
        
    
    
    
    
    return true;
}











const taskSchema = {        
    c_name: { type: "String" },
    c_description: { type: "String" },
    c_eligibility_condition: { type: "String" },
    c_intended_use: { type: "String" },
    c_number_of_steps_per_leg: { type: "Number" },
    c_rest_duration: { type: "Number" },
    c_walk_duration: { type: "Number" },
    c_dominant_left: { type: "Boolean" },
    c_number_of_pegs: { type: "Number" },
    c_time_limit: { type: "Number" },
    c_threshold: { type: "Number" },
    c_rotated: { type: "Boolean" },
    c_instructions: { type: "Boolean" },
    c_conclusion: { type: "Boolean" },
    c_accelerometer: { type: "Boolean" },
    c_device_motion: { type: "Boolean" },
    c_pedometer: { type: "Boolean" },
    c_location: { type: "Boolean" },
    c_heart_rate: { type: "Boolean" },
    c_audio: { type: "Boolean" },
    c_response_validity_period_unit: { type: "String" },
    c_response_validity_period_value: { type: "Number" },
    c_survey_schedule_unit: { type: "String" },
    c_survey_schedule_value: { type: "Number" },
    c_code: { type: "String" },
    c_study: { type: "Reference" },
    c_steps: { type: "Reference[]" },
    c_branches: { type: "Reference[]" },
    c_type: { type: "String" },
    c_active_type: { type: "String" },
    c_number_of_disks: { type: "Number" },
    c_groups: { 
        type: "ObjectId[]",
        copier: "omit"
    },
    c_speech_instruction: { type: "String" },
    c_short_speech_instruction: { type: "String" },
    c_duration: { type: "Number" },
    c_record_settings: { type: "String" },
    c_html_review_content: { type: "String" },
    c_use_as_template: { type: "Boolean" }
};

const stepSchema = {
    c_text: { type: "String" },
    c_description: { type: "String" },
    c_unit: { type: "String" },
    c_maximum: { type: "Number" },
    c_minimum: { type: "Number" },
    c_multiple_lines: { type: "Boolean" },
    c_maximum_length: { type: "Number" },
    c_use_current_location: { type: "Boolean" },
    c_default_hour: { type: "Number" },
    c_default_minute: { type: "Number" },
    c_default_date: { type: "Date" },
    c_minimum_date: { type: "Date" },
    c_maximum_date: { type: "Date" },
    c_calendar: { type: "String" },
    c_default: { type: "Number" },
    c_fraction_digit: { type: "Number" },
    c_maximum_description: { type: "String" },
    c_minimum_description: { type: "String" },
    c_step_size: { type: "Number" },
    c_default_index: { type: "Number" },
    c_default_interval: { type: "Number" },
    c_task: { type: "Reference" },
    c_name: { type: "String" },
    c_style: { type: "Boolean" },
    c_text_choices: {
      type: "Document",
      isArray: true,
      properties: {
        c_value: { type: "String" },
        c_description: { type: "String" },
        c_text:{ "type": "String" },
        c_exclusive: { "type": "Boolean" },
        c_order: { "type": "Number" }     
      }
    },
    c_vertical: { type: "Boolean" },
    c_maximum_fraction_digit: { type: "Number" },
    c_allow_multiples: { type: "Boolean" },
    c_optional: { type: "Boolean" },
    c_image_choices: {
      type: "Document",
      isArray: true,
      properties: {
        c_name : { "type": "String" },
        c_image_file : { "type": "File" },
        c_text : { "type": "String" },
        c_value : { "type": "String" },
        c_image : { "type": "File" },
        c_order : { "type": "Number" }  
      }
    },
    c_date_only: { type: "Boolean" },
    c_type: { type: "String" },
    c_document_section: { type: "String" },
    c_order: { type: "Number" },
    c_image: { type: "File" },
    c_parent: { type: "ObjectId" },
    c_parent_step: { type: "Reference" },
    c_form_steps: { type: "Reference", isArray: true },
    c_success: { type: "Boolean" },
    c_visible: { type: "Boolean" },
    c_placeholder: { type: "String" },
    c_image_insets: { type: "Number", isArray: true },
    c_accessibility_instructions: { type: "String" },
    c_accessibility_hint: { type: "String" },
    c_account_map: { type: "String" },
    c_validation_type: { type: "String" },
    c_validation_regex: { type: "String" },
    c_original_item: { type: "Reference" },
    c_original_step: { type: "ObjectId" },
    c_secure_text_entry: { type: "Boolean" },
    c_invalid_message: { type: "String" },
    c_require_validation: { type: "Boolean" },
    c_disabled: { type: "Boolean" },
    c_camera: { type: "String" },
    c_quantity_types: {
      type: "Document",
      isArray: true,
      properties: {
        c_type : { "type": "String" },
        c_unit : { "type": "String" },
        c_read_write_type : { "type": "Number" },
        c_sub_type : { "type": "String" },
        c_use_decimal : { "type": "Boolean" },
        c_order : { "type": "Number" },
        c_include_historical : { "type": "Boolean" }
      }
    },
    c_completion_text_list: { type: "String" },
    c_completion_text_list_restrict: { type: "Boolean" },
    c_match_anywhere: { type: "Boolean" },
    c_formal_title: { type: "String" },
    c_html_content: { type: "String" },
    c_omit_from_doc: { type: "Boolean" },
    c_learn_more_button: { type: "String" },
    c_google_fit_permissions: {
      type: "Document",
      isArray: true,
      properties: {
        c_type: { "type": "String" },
        c_read_write_type: { "type": "Number" },
        c_sub_type: { "type": "String" },
        c_use_decimal: { "type": "Boolean" },
        c_order: { "type": "Number" },
        c_include_historical: { "type": "Boolean" }
      }
    },
    c_content_url: { type: "String" },
    c_get_air_quality_data: { type: "Boolean" }
  };

  
  
export { stepSchema, taskSchema, test };