function generateVariableDisplayText(variableData) {
  if (Array.isArray(variableData)) {
    const listVariableDisplayText = variableData.map(data => {
      return Object.values(data.labels).map(label => label.display).join(', ')
    }).join('; ')
    return ` ${listVariableDisplayText}`
  } else {
    return variableData.display
  }
}

function transformKeysInStepObject(step, taskVariableNames, taskVariables) {
  const textStepKeys = ['c_description', 'c_question', 'c_text', 'c_text_choices']

  // Iterate over each key in the step object
  for (const stepKey in step) {
    if (textStepKeys.includes(stepKey)) {
      let stepValue = step[stepKey]

      // Check if any key from the keys list is in the step string
      taskVariableNames.forEach(variableName => {
        // get variable display text
        const variableDisplayText = generateVariableDisplayText(taskVariables[variableName])

        // String replacement for text choice display texts
        if (Array.isArray(stepValue)) {
          stepValue = stepValue.map(value => {
            const { c_text: displayText } = value
            if (displayText && displayText.includes(`{${variableName}}`)) {
              return { ...value, c_text: displayText.replace(new RegExp(`{${variableName}}`, 'g'), variableDisplayText) }
            }
            return value
          })
        } else if (stepValue.includes(`{${variableName}}`)) {
          // Replace the placeholder with the value from objectData
          stepValue = stepValue.replace(new RegExp(`{${variableName}}`, 'g'), variableDisplayText)
        }
      })

      // Update the step with the new value
      step[stepKey] = stepValue
    }
  }

  return step
}

function insertVariableTextChoices(step, stepResponse, taskVariables) {
  const choicesVariable = step.c_screen_details && step.c_screen_details.c_screen_data && step.c_screen_details.c_screen_data.choices_variable
  const choicesVariableData = choicesVariable && taskVariables[choicesVariable]

  if ((!step.c_text_choices || !step.c_text_choices.length) && choicesVariableData) {
    const stepResponseChoiceValues = stepResponse.c_value

    // loop over the text_choice responses and create the c_text_choices
    const cTextChoices = stepResponseChoiceValues.map(stepResponseChoiceValue => {
      const requiredChoiceData = choicesVariableData.find(choice => choice.value.toString() === stepResponseChoiceValue.toString())
      const requiredChoiceDataLabels = requiredChoiceData.labels
      return {
        c_value: stepResponseChoiceValue,
        c_text: Object.keys(requiredChoiceDataLabels).map(key => requiredChoiceDataLabels[key].display).join(', ')
      }
    })
    step.c_text_choices = cTextChoices
  }

  return step
}

module.exports = {
  transformKeysInStepObject,
  insertVariableTextChoices
}