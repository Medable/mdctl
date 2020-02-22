# Plugin Tasks
 
Adds a series of runtime routes that, when used in conjunction with @plugin/@command decorators and entries
into a c_mdctl_plugins config key, integrates mdctl commands with the back end.

Adds these routes to the environement:

* GET /routes/mdctl
  * callable by 'account.public'
  * returns a list of plugins and commands callable by the current principal.
* GET /routes/mdctl/:plugin
  * callable by 'account.public'
  * returns a list of commands callable by the current principal.
* POST /routes/mdctl/:plugin/:command
  * callable by 'account.public'
  * gated by the plugin/command acl. defaults to 'role.administrator'
 

Because they exist in user-land, this requires a `c_mdctl_plugins` config key which contains an array of library
exports where @plugin/@command usages are located (@plugin does not auto-register with the environment runtime).

To use, create a plugin class, expose some commands, add the library export in which it's contained to the
`c_mdctl_plugins` config key and use the mdctl-cli to call it.

### Setup

Import the accompanying environment and skip to usage examples, or...

Save a library script with the `c_mdctl` export with the contents of env/scripts/js/library.c_mdctl.js

Save the library script below with the `c_example` export (or use env/scripts/js/library.c_example.js)

```javascript
const { plugin, command } = require('c_mdctl')
 
@plugin('example', { acl: 'role.developer', environment: '*' })
class TestPlugin {

  @command('echo', { environment: 'development' })
  static echo(...args) {
    return args
  }

  @command('multiply', { acl: 'role.administrator', environment: 'development' })
  static multiply(number, by = 2) {
    return number * by
  }
}
```

Create a config key called `c_mdctl_plugins` with `["c_example"]` as the value.

### Usage

Now you should be able to call the plugin from mdtcl. If your tasks collide with built-in
tasks, precede the plugin name with `plugin`

Arguments can come from a json document or be passed on the command line and  must be valid
json.

```
$ mdctl example echo \"string\" 
{"object":"list","data":["string"],"hasMore":false}`

$ mdctl example multiply 2 3
6

$ mdctl plugin example multiply 2 3
6

// args.json -->
// [
//   {
//     "foo": "bar"
//   },
//   123
// ]

$ cat ./args.json | mdctl example echo 
{"object":"list","data":[{"foo":"bar"},123],"hasMore":false}
```
