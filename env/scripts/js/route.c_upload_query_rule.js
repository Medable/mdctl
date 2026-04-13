/***********************************************************

@script     Upload Query Rule

@brief      Accpets a query rule definition in the body.
            If "skip" is not set, it will invoke the query
            library to create the query rule.

@body
    skip: If set to "1" it will skip the creation of the rule.
      This is a hack to easily omit the creation of rules
      when hitting this route with a postman runner.
    c_name: Codename for the rule. If the code already exists
      the rule with that code will be overwritten with
      the new payload.
    c_study: _id of the study the rule belongs to.
    c_task_name: "c_name" of task the query rule belongs to.
      It being a String (c_name) instead of an _id (which is more
      appropriate) stems from the fact that this endpoint was created
      to upload a spreadsheet of rules, where using names instead of
      ids was more human readable.
    c_rules: Escaped string that has the JSON AST for the rule.
      Documetation on query rules grammar and semantics pending.
    c_message: Message of the query rule that will be shown to users
      when queries are raised on behalf of this rule

(c)2016-2019 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import { createQuery } from 'c_nucleus_query'
import { body } from 'request'

let { skip, c_name, c_study, c_task_name, c_rules, c_message } = body
c_rules = unescape(c_rules)
c_message = unescape(c_message)

if (skip === '1') return true

return createQuery({ c_name, c_study, c_task_name, c_rules, c_message })