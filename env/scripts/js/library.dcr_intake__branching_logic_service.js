/**
 * @fileOverview
 * @summary Implements branching logic analysis for steps and tasks.
 * Handles analysis of step transitions, task flow, and affected steps.
 *
 * @author Data Management Squad
 *
 * @example
 * const { BranchingLogicService } = require('dcr_intake__branching_logic_service')
 */

const faults = require('c_fault_lib'),
  { as } = require('decorators'),
  { accessLevels } = consts, 
  logger = require('logger')

/**
 * Branching Logic Service
 *
 * @class BranchingLogicService
 */
class BranchingLogicService {

  /**
   * Get affected steps for branching logic analysis
   * @memberOf BranchingLogicService
   * @param {String} taskResponseId Task response ID
   * @return {Object} affected steps data
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.update }, modules: { safe: false } })
  static getAffectedStepsForChange(taskResponseId) {
    // Get task response and all its steps
    const taskResponse = org.objects.c_task_responses.find({ _id: taskResponseId })
      .paths('c_task', 'c_public_user', 'c_site')
      .skipAcl()
      .next()

    if (!taskResponse) {
      faults.throw('dcr_intake.notFound.taskResponse')
    }

    // Get all steps for this task
    const allSteps = org.objects.c_steps.find({ c_task: taskResponse.c_task._id })
      .sort({ c_order: 1 })
      .skipAcl()
      .toArray()

    // Get current step responses
    const currentResponses = org.objects.c_step_responses.find({ c_task_response: taskResponseId })
      .paths('c_step', 'c_value', 'c_skipped', 'c_original_value')
      .skipAcl()
      .toArray()

    // Find the branching source step (first step with transitions)
    const branchingSourceStep = allSteps.find(step => 
      step.c_screen_details && 
      step.c_screen_details.c_screen_data && 
      step.c_screen_details.c_screen_data.transition &&
      step.c_screen_details.c_screen_data.transition.conditions &&
      Array.isArray(step.c_screen_details.c_screen_data.transition.conditions) &&
      step.c_screen_details.c_screen_data.transition.conditions.length > 0
    )

    if (!branchingSourceStep) {
      // No branching logic found, return empty result
      return {
        success: true,
        affectedSteps: [],
        branchingInfo: {
          selectedScreen: 'No branching logic',
          totalAffectedSteps: 0,
          hasBranching: false
        }
      }
    }

    // Get affected steps based on branching logic starting from the source
    const affectedSteps = this.findAffectedStepsForChange(branchingSourceStep, allSteps, currentResponses)

    // Format the response for the UI table
    const tableRows = this.formatTableRows(affectedSteps, currentResponses)

      return {
        success: true,
        affectedSteps: tableRows,
        branchingInfo: {
          selectedScreen: branchingSourceStep.c_name,
          totalAffectedSteps: affectedSteps.length,
          hasBranching: this.hasBranchingLogic(branchingSourceStep)
        }
      }

  }

  /**
   * Find steps affected by branching logic changes
   * @memberOf BranchingLogicService
   * @param {Object} selectedStep
   * @param {Object[]} allSteps
   * @param {Object[]} currentResponses
   * @return {Object[]} affected steps
   */
  static findAffectedStepsForChange(selectedStep, allSteps, currentResponses) {
    const affectedSteps = []
    const stepMap = new Map()

    // Create step lookup map
    allSteps.forEach(step => {
      stepMap.set(step.c_key, step)
      stepMap.set(step._id, step)
    })

    // Get current execution path
    const currentPath = this.getCurrentExecutionPath(allSteps, currentResponses)

    // Find all steps that could be affected by changes to the selected step
    const potentiallyAffectedSteps = this.findStepsAffectedByBranching(
      selectedStep,
      allSteps,
      currentPath
    )

    // For each potentially affected step, create a table row
    for (const step of potentiallyAffectedSteps) {
      const currentResponse = currentResponses.find(
        sr => sr.c_step._id.toString() === step._id.toString()
      )

      affectedSteps.push({
        stepId: step._id,
        stepKey: step.c_key,
        screenName: `${step.c_order}. ${step.c_name}`,
        stepType: step.c_type,
        currentValue: this.getCurrentValue(currentResponse, step),
        availableChoices: this.getAvailableChoices(step, allSteps),
        isAffected: this.isStepAffectedByChange(step, selectedStep, currentPath),
        impactType: this.getImpactType(step, selectedStep, currentPath)
      })
    }

    return affectedSteps.sort((a, b) => {
      // Sort by order to ensure proper sequence
      const aOrder = parseInt(a.screenName.split('.')[0]) || 0
      const bOrder = parseInt(b.screenName.split('.')[0]) || 0
      return aOrder - bOrder
    })
  }

  /**
   * Check if step has branching logic
   * @memberOf BranchingLogicService
   * @param {Object} step
   * @return {Boolean}
   */
  static hasBranchingLogic(step) {
    return step.c_screen_details &&
      step.c_screen_details.c_screen_data &&
      step.c_screen_details.c_screen_data.transition &&
      step.c_screen_details.c_screen_data.transition.conditions &&
      step.c_screen_details.c_screen_data.transition.conditions.length > 0
  }

  /**
   * Find steps affected by branching logic
   * @memberOf BranchingLogicService
   * @param {Object} selectedStep
   * @param {Object[]} allSteps
   * @param {Array} currentPath
   * @return {Object[]} affected steps
   */
  static findStepsAffectedByBranching(selectedStep, allSteps, currentPath) {
    const affectedSteps = new Set()

    // Always include the selected step itself
    affectedSteps.add(selectedStep)

    // If the selected step has branching logic, find all downstream steps
    if (this.hasBranchingLogic(selectedStep)) {
      const branchingDestinations = this.getBranchingDestinations(selectedStep)

      // Add all possible destination steps
      branchingDestinations.forEach(destination => {
        if (destination === "_NEXT_" || destination === "") {
          // Handle _NEXT_ transitions by finding the next step in order
          const nextStepInOrder = this.getNextStepInOrder(selectedStep, allSteps)
          if (nextStepInOrder) {
            affectedSteps.add(nextStepInOrder)
            // Recursively find steps affected by this destination
            const downstreamSteps = this.findDownstreamSteps(nextStepInOrder, allSteps)
            downstreamSteps.forEach(step => affectedSteps.add(step))
          }
        } else {
          // Handle explicit destination steps
          const destStep = allSteps.find(step => step.c_key === destination)
          if (destStep) {
            affectedSteps.add(destStep)
            // Recursively find steps affected by this destination
            const downstreamSteps = this.findDownstreamSteps(destStep, allSteps)
            downstreamSteps.forEach(step => affectedSteps.add(step))
          }
        }
      })
    }

    // Include all steps that could be part of the branching chain
    // This ensures that steps like "side" are included even if they don't have explicit branching logic
    const sortedSteps = allSteps.sort((a, b) => a.c_order - b.c_order)
    const selectedStepIndex = sortedSteps.findIndex(step => step._id.toString() === selectedStep._id.toString())
    
    if (selectedStepIndex >= 0) {
      // Include all steps from the selected step onwards that could be part of the flow
      for (let i = selectedStepIndex; i < sortedSteps.length; i++) {
        const step = sortedSteps[i]
        
        // Skip instruction steps unless they're the selected step
        if (step.c_type === 'instruction' && step._id.toString() !== selectedStep._id.toString()) {
          continue
        }
        
        affectedSteps.add(step)
      }
    }

    return Array.from(affectedSteps)
  }

  /**
   * Get next step in order for _NEXT_ transitions
   * @memberOf BranchingLogicService
   * @param {Object} currentStep
   * @param {Object[]} allSteps
   * @return {Object|null} next step in order
   */
  static getNextStepInOrder(currentStep, allSteps) {
    // Find the next step in order after the current step
    const sortedSteps = allSteps.sort((a, b) => a.c_order - b.c_order)
    const currentIndex = sortedSteps.findIndex(step => step._id.toString() === currentStep._id.toString())
    
    if (currentIndex >= 0 && currentIndex < sortedSteps.length - 1) {
      return sortedSteps[currentIndex + 1]
    }
    
    return null
  }

  /**
   * Get branching destinations from step
   * @memberOf BranchingLogicService
   * @param {Object} step
   * @return {String[]} destinations
   */
  static getBranchingDestinations(step) {
    const destinations = []
    const transition = step.c_screen_details &&
      step.c_screen_details.c_screen_data &&
      step.c_screen_details.c_screen_data.transition

    if (transition) {
      if (transition.conditions) {
        transition.conditions.forEach(condition => {
          destinations.push(condition.destination)
        })
      }
      if (transition.default) {
        destinations.push(transition.default)
      }
    }

    return destinations
  }

  /**
   * Find downstream steps recursively
   * @memberOf BranchingLogicService
   * @param {Object} startStep
   * @param {Object[]} allSteps
   * @return {Object[]} downstream steps
   */
  static findDownstreamSteps(startStep, allSteps) {
    const downstreamSteps = []
    const visited = new Set()

    const traverse = (step) => {
      if (visited.has(step._id)) return
      visited.add(step._id)

      if (this.hasBranchingLogic(step)) {
        const destinations = this.getBranchingDestinations(step)
        destinations.forEach(dest => {
          if (dest === "_NEXT_" || dest === "") {
            // Handle _NEXT_ transitions
            const nextStepInOrder = this.getNextStepInOrder(step, allSteps)
            if (nextStepInOrder) {
              downstreamSteps.push(nextStepInOrder)
              traverse(nextStepInOrder)
            }
          } else {
            // Handle explicit destination steps
            const destStep = allSteps.find(s => s.c_key === dest)
            if (destStep) {
              downstreamSteps.push(destStep)
              traverse(destStep)
            }
          }
        })
      }
    }

    traverse(startStep)
    return downstreamSteps
  }

  /**
   * Get current execution path
   * @memberOf BranchingLogicService
   * @param {Object[]} allSteps
   * @param {Object[]} currentResponses
   * @return {Array} current path
   */
  static getCurrentExecutionPath(allSteps, currentResponses) {
    // This would need to be implemented based on how you track
    // the current execution path through the branching logic
    // For now, return empty array as placeholder
    return []
  }

  /**
   * Format table rows for UI
   * @memberOf BranchingLogicService
   * @param {Object[]} affectedSteps
   * @param {Object[]} currentResponses
   * @return {Object[]} formatted table rows
   */
  static formatTableRows(affectedSteps, currentResponses) {
    return affectedSteps
      .map(step => {
        const currentResponse = currentResponses.find(
          sr => sr.c_step._id.toString() === step.stepId.toString()
        )


        return currentResponse ? {
          stepId: step.stepId,
          stepKey: step.stepKey,
          stepResponseId: currentResponse._id,
          screen: step.screenName,
          originalValue: this.formatOriginalValue(step),
          originalLabel: currentResponse.c_original_value,
          skipped: currentResponse.c_skipped,
          desiredValue: {
            options: step.availableChoices,
            editable: step.stepType !== 'instruction'
          },
          impactType: step.impactType,
          requiresChange: step.isAffected
        } : null
      })
      .filter(step => step !== null)
  }

  /**
   * Format original value for display
   * @memberOf BranchingLogicService
   * @param {Object} step
   * @return {String} formatted value
   */
  static formatOriginalValue(step) {
    if (!step.currentValue) return "No response"
    switch (step.stepType) {
      case 'text_choice':
        // Handle both single values and arrays of values
        return step.currentValue || []

      case 'text':
        return step.currentValue || "No text entered"

      case 'numeric':
        return step.currentValue && step.currentValue.toString() || "No value"

      case 'boolean':
        return step.currentValue ? "Yes" : "No"

      default:
        return step.currentValue && step.currentValue.toString() || "No response"
    }
  }

  /**
   * Get available choices for step
   * @memberOf BranchingLogicService
   * @param {Object} step
   * @param {Object[]} allSteps
   * @return {Object[]} choices
   */
  static getAvailableChoices(step, allSteps) {
    if (step.c_type === 'text_choice' && step.c_text_choices) {
      return step.c_text_choices.map(choice => {
        const nextStepInfo = this.getNextStepForChoice(step, choice.c_value, allSteps)
        return {
          value: choice.c_value,
          label: choice.c_text,
          key: choice.c_key,
          nextStep: nextStepInfo.stepId,
          nextStepName: nextStepInfo.stepName
        }
      })
    }
    return []
  }

  /**
   * Get next step information for a specific choice
   * @memberOf BranchingLogicService
   * @param {Object} step
   * @param {String} choiceValue
   * @param {Object[]} allSteps
   * @return {Object} next step info
   */
  static getNextStepForChoice(step, choiceValue, allSteps) {
    if (!this.hasBranchingLogic(step)) {
      return { stepId: null, stepName: "Next step" }
    }

    const transition = step.c_screen_details.c_screen_data.transition
    
    // Check conditions first
    if (transition.conditions) {
      for (const condition of transition.conditions) {
        // Extract values from JSONLogic condition
        const conditionValues = this.extractValuesFromCondition(condition.condition)
        
        // Check if this choice matches the condition
        const matchesCondition = conditionValues.includes(choiceValue) || conditionValues.includes("ANY_VALUE")
        
        if (matchesCondition) {
          if (condition.destination === "_NEXT_" || condition.destination === "") {
            // Handle _NEXT_ transitions
            const nextStepInOrder = this.getNextStepInOrder(step, allSteps)
            return {
              stepId: nextStepInOrder ? nextStepInOrder._id : null,
              stepName: nextStepInOrder ? `${nextStepInOrder.c_order}. ${nextStepInOrder.c_name}` : "_NEXT_"
            }
          } else {
            // Handle explicit destination steps
            const nextStep = allSteps.find(s => s.c_key === condition.destination)
            return {
              stepId: nextStep ? nextStep._id : null,
              stepName: nextStep ? `${nextStep.c_order}. ${nextStep.c_name}` : condition.destination
            }
          }
        }
      }
    }
    
    // If no condition matches, use default
    if (transition.default) {
      if (transition.default === "_NEXT_" || transition.default === "") {
        // Handle _NEXT_ transitions
        const nextStepInOrder = this.getNextStepInOrder(step, allSteps)
        return {
          stepId: nextStepInOrder ? nextStepInOrder._id : null,
          stepName: nextStepInOrder ? `${nextStepInOrder.c_order}. ${nextStepInOrder.c_name}` : "_NEXT_"
        }
      } else {
        // Handle explicit destination steps
        const nextStep = allSteps.find(s => s.c_key === transition.default)
        return {
          stepId: nextStep ? nextStep._id : null,
          stepName: nextStep ? `${nextStep.c_order}. ${nextStep.c_name}` : transition.default
        }
      }
    }
    
    return { stepId: null, stepName: "Next step" }
  }

  /**
   * Extract values from JSONLogic condition
   * @memberOf BranchingLogicService
   * @param {Object} condition
   * @return {String[]} values
   */
  static extractValuesFromCondition(condition) {
    const values = []
    
    if (condition.or && Array.isArray(condition.or)) {
      for (const orCondition of condition.or) {
        if (orCondition.includes_any && Array.isArray(orCondition.includes_any)) {
          // Extract values from includes_any array (second element)
          const valueArray = orCondition.includes_any[1]
          if (Array.isArray(valueArray)) {
            values.push(...valueArray)
          }
        } else if (orCondition.any && Array.isArray(orCondition.any)) {
          // Handle "any" condition - this means any value should match
          // We need to get all possible values for this step
          // For now, we'll return a special marker to indicate "any value"
          values.push("ANY_VALUE")
        }
      }
    }
    
    return values
  }

  /**
   * Get current value from response
   * @memberOf BranchingLogicService
   * @param {Object} response
   * @param {Object} step
   * @return {String} current value
   */
  static getCurrentValue(response, step) {
    return response ? response.c_value : null
  }

  /**
   * Check if step is affected by change
   * @memberOf BranchingLogicService
   * @param {Object} step
   * @param {Object} selectedStep
   * @param {Array} currentPath
   * @return {Boolean}
   */
  static isStepAffectedByChange(step, selectedStep, currentPath) {
    // Implementation would depend on specific branching logic analysis
    return true
  }

  /**
   * Get impact type for step
   * @memberOf BranchingLogicService
   * @param {Object} step
   * @param {Object} selectedStep
   * @param {Array} currentPath
   * @return {String} impact type
   */
  static getImpactType(step, selectedStep, currentPath) {
    if (String(step._id) === String(selectedStep._id)) {
      return "branching_source"
    }
    return "downstream_affected"
  }

}

module.exports = { BranchingLogicService }