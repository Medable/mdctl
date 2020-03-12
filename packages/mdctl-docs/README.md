# mdctl-docs

Medable documentation tool.

## env

Navigate to directory containing an exported environment

```bash
export ENV_EXPORT_HOME=/path/to/env/export
cd ${ENV_EXPORT_HOME}
```

Generate documentation

```bash
mdctl docs --module env
```

By default, documentation is generated in `${ENV_EXPORT_HOME}/docs`.

### Script Headers

To capture additional information such as version, authors, and summary, please include a _[JSdoc](https://jsdoc.app/)_ styled comment to the top of the script file. [JSdoc](https://jsdoc.app/) description and examples are rendered using markdown formatting.

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
 * @example
 * ```javascript
 * mdctl api POST userCreator --env=dev.example
 * ```
 * @copyright
 *
 * (c)2016-2020 Medable, Inc.  All Rights Reserved.
 * Unauthorized use, modification, or reproduction is prohibited.
 * This is a component of Axon, Medable's SmartStudy(TM) system.
 */
```

### Routes

To capture route parameters (path, body, query, header, and response) please include a _[JSdoc](https://jsdoc.app/)_ styled comment describing the route. Routes can be defined within the header of a route script file, or above their coresponding decorator within a library script file.

*Route Script*

```javascript
/**
 * @file
 * @summary route script example
 * @version 1.0.0
 *
 * @author Medable Developer
 *
 * @route-param-path {string} id - Resource ID
 * @route-param-body {Object} data - Resource data
 * @route-param-body {string} data.name
 * @route-param-query {string} token - Access token
 * @route-param-header {string} Authorization
 * @route-param-response {Object} resource - Resource
 * @route-param-response {string} resource.id
 * @route-param-response {string} resource.name
 */
```

*Decorator: @route*

```javascript
/**
 * @route c_340_ping - post
 * @param-route-path {string} id - Resource ID
 * @param-route-body {Object} data - Resource data
 * @param-route-body {string} data.name
 * @param-route-query {string} token - Access token
 * @param-route-header {string} Authorization
 * @param-route-response {Object} resource - Resource
 * @param-route-response {string} resource.id
 * @param-route-response {string} resource.name
 */
@route({
  weight: 1,
  method: 'POST',
  name: 'c_340_post',
  path: 'c_340_ping',
  acl: 'role.administrator'
})
post({ req, res, body, next, runtime }) {

    return body('myData')

}
```

### TODO

* Upgrade to node v12.X (currently v8.16.2)
* Additional tests for runtime resources
