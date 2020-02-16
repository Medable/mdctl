# Table of contents
* [Introduction](README.md)  
* [Apps](env/apps.md)
* [Notifications](env/notifications.md)
* [Roles](env/roles.md)
* [Service Accounts](env/serviceAccounts.md)
* [Policies](env/policies.md)
* [Runtime](env/runtime.md) --> the current environment runtime and links to them?

## Objects
* [Introduction](objects/README.md)
* [Step Response](objects/c_step_response.md)
* [Task Response](objects/c_task_response.md)
* [Study](objects/c_study.md)
  * [Study 123 (uuid or c_name)](objects/c_study/uuid_or_name_instance.md) --> instance properties?

## Scripts
* [Introduction](scripts/README.md)
* [Routes](scripts/routes/README.md)
    * [c_route_foo - GET /routes/xyz](scripts/routes/c_route_foo.md)
    * ...
* [Policies] 
    * [c_foo_transform](scripts/policies/c_foo_transform.md)
* [Libraries](scripts/libraries/README.md)    
    * ...
* [Jobs](scripts/jobs/README.md)
    * ...    
* [Triggers](scripts/triggers/README.md)
    * ...

## Class Hierarchy (from libraries and packages?) // this would be the sorted from jsdoc.
* [global](api/global.md)
* [CSAxon](api/classes/library(c_axon).CSAxon.md)
* [CSAxonUtils](api/classes/library(c_axon_utils).CSAxonUtils.md) --> In the file, exports, classes etc.
...

## Release Notes
* [4.8.0](releases/4.8.0.md)



/**
 * @file
 * @summary Utility functions used in Nucleus scripts
 * @version 1.0.0
 *
 * @author Fiachra Matthews
 *
 * @description
 * ```javascript
 * const script = require('script')
 * ```
 *
 * @example
 * ```javascript
 * const script = require('script')
 * script.run()
 * ```
 *
 * @example
 * ```javascript
 * const script = require('script')
 * script.run('another way')
 * ```
 *
 * @copyright
 *
 * (c)2016-2018 Medable, Inc.  All Rights Reserved.
 * Unauthorized use, modification, or reproduction is prohibited.
 * This is a component of Axon, Medable's SmartStudy(TM) system.
 */