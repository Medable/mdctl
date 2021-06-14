/* eslint-disable node/no-path-concat */
// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

module.exports = {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  setupFilesAfterEnv: [`${__dirname}/__tests__/global/setup`],

  // A set of global variables that need to be available in all test environments
  globals: {
    __API__: {
      strictSSL: false,
      environment: {
        endpoint: process.env.JEST_ENDPOINT || 'api-int-dev.medable.com',
        env: process.env.JEST_ENV
      },
      credentials: {
        type: 'token',
        token: process.env.JEST_TOKEN,
        apiKey: process.env.JEST_API_KEY
      }
    },
    __DELETE_PATHS__: {}
  },

  // Use this configuration option to add custom reporters to Jest
  reporters: [
    'default',
    ['./node_modules/jest-html-reporter', {
      pageTitle: 'Axon Org Config Unit Tests Report',
      outputPath: './unit-tests-report.html'
    }],
    'jest-junit'
  ],

  // The test environment that will be used for testing
  testEnvironment: 'node',

  // The glob patterns Jest uses to detect test files
  testMatch: [
    `${__dirname}/__tests__/**/**.test.js`
  ],

  // An array of regexp pattern strings
  // that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: [
    '/node_modules/'
  ],

  // Indicates whether each individual test should be reported during the run
  verbose: true
}
