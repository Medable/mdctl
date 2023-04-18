const { prompt } = require('inquirer'),

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
        const choices = inputArgs.consents.map(v => ({ name: `${v.ec__identifier} || ${v.ec__title}`, value: v._id })),
              result = await prompt([{
                type: 'checkbox',
                name: 'selectedConsents',
                message: 'Please Select the Templates you wish to export',
                choices
              }])

        return result.selectedConsents
      },

      askSelectDtConfigs = async(dtConfigs) => {
        // eslint-disable-next-line no-underscore-dangle
        const choices = dtConfigs.map(v => ({ name: v.dt__name, value: v._id })),
              result = await prompt([{
                type: 'checkbox',
                name: 'selectedDtConfigs',
                message: 'Please Select the Configs you wish to export',
                choices
              }])

        return result.selectedDtConfigs
      }

module.exports = {
  askSelectTasks,
  askSelectConsentTemplates,
  askSelectDtConfigs
}
