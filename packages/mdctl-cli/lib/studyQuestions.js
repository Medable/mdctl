const { prompt } = require('inquirer'),
      _ = require('lodash'),

      askSelectTasks = async(inputArgs) => {
        // eslint-disable-next-line no-underscore-dangle
        const choices = inputArgs.tasks.map(v => ({ name: v.c_name, value: v._id })),
              result = await prompt([{
                type: 'checkbox',
                name: 'selectedTasks',
                message: 'Please Select the Tasks you wish to export',
                choices
              }])

        return result.selectedTasks
      },

      askSelectConsentTemplates = async(inputArgs) => {
        // eslint-disable-next-line no-underscore-dangle
        const choices = inputArgs.consents.map(v => ({ name: v.ec__title, value: v._id })),
              result = await prompt([{
                type: 'checkbox',
                name: 'selectedConsents',
                message: 'Please Select the Tasks you wish to export',
                choices
              }])

        return result.selectedConsents
      }

module.exports = {
  askSelectTasks,
  askSelectConsentTemplates
}
