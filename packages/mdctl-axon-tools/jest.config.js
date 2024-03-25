/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

module.exports = {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // The test environment that will be used for testing
  testEnvironment: 'node',

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'v8',

  // Automatically restore mock state and implementation before every test
  restoreMocks: true,

  // Custom reporters
  reporters: ['default',
    ['jest-html-reporters', {
      publicPath: './reports',
      filename: 'report.html',
      stripSkippedTest: true,
      customInfos: [{
        title: 'Ref',
        value: process.env.GITHUB_HEAD_REF
      }, {
        title: 'Commit #',
        value: process.env.CI_COMMIT_SHORT_SHA
      }]
    }]]

}
