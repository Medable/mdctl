# mdctl-docs

Medable documentation tool.

## env

Navigate to `ENV_EXPORT_HOME`

```bash
cd ${ENV_EXPORT_HOME}
```

Generage documentation while exporting an `env`

```bash
mdctl env export --docs
```

Generate documentation for an already exported `env`

```bash
mdctl docs --module env
```

By default, documentation is generated in `${ENV_EXPORT_HOME}/docs`.

To view output logs, include the `--log` flag. To view detailed output logs, include the `--verbose` flag. To view JSDoc debugging information, include the `--debug` flag.

```bash
mdctl docs --module env --log
mdctl docs --module env --verbose
mdctl docs --module env --debug
```

### Routes

To capture route parameters (path, body, query, header, and response) and additional information such as version, authors, and summary, please include a _[JSdoc](https://jsdoc.app/)_ styled comment to the top of the route script file. [JSdoc](https://jsdoc.app/) description and examples are rendered using markdown formatting.

_Please note that including **@file** is required._

```javascript
/**
 * @file
 * @summary Account creator
 * @version 1.0.0
 *
 * @author Medable Developer
 *
 * @description
 * ```javascript
 * const { email, password, name } = require('request').body;
 *
 * return require('accounts').register({ email, password, name }, {
 *    skipVerification: true,
 *    skipActivation: true,
 *    skipNotification: true,
 *    requireMobile: false
 * });
 * ```
 *
 * @route-param-path {string} id - Resource ID
 * @route-param-body {Object} data - Resource data
 * @route-param-body {string} data.name
 * @route-param-query {string} token - Access token
 * @route-param-header {string} Authorization
 * @route-param-response {Object} resource - Resource
 * @route-param-response {string} resource.id
 * @route-param-response {string} resource.name
 *
 * @example
 * ```javascript
 * mdctl api POST userCreator --env=dev.example
 * ```
 *
 * @copyright
 *
 * (c)2016-2020 Medable, Inc.  All Rights Reserved.
 * Unauthorized use, modification, or reproduction is prohibited.
 * This is a component of Axon, Medable's SmartStudy(TM) system.
 */
 ```

 ### TODO

 * Capture documentation for class hierarchy and release notes when generating documentation for an environment