# mdctl-cli

Developer Tools Cli for Medable 

## Credentials

Our developer tools allow you to store your credentials in a safe way and use them to perform other operations later on.

#### Add new credentials 

To add new credentials simply run the next command follow the prompts.

`mdctl credentials add` 

You can also specify some arguments
```
--type - sets the type (password, token, signature). auto-detected when adding/updating.
--endpoint - sets the endpoint. eg. https://api.dev.medable.com
--env sets the environment. eg. my-org-code
--apiKey api key for looking up signing credentials (and token credentials)
```

Secret fields are still required to be filled manually (e.g: password).

You can add credentials from a file by using the `--file path/to/file` argument.

##### Reading credentials from file

File can be provided in YAML or JSON format, the following fields can be defined
```
type - sets the type (password, token, signature). auto-detected when adding/updating.
endpoint - sets the endpoint. eg. https://api.dev.medable.com
env - sets the environment. eg. my-org-code
apiKey - api key for looking up signing credentials (and token credentials)
password - account password for login
apiSecret - api secret key for signing
token - jwt token, which must include the 'cortex/eml' claim for lookup
```

#### Listing credentials

To list the existing credentials simply run

`mdctl credentials list`

It's also possible to filter the credentials by providing arguments
```
--type filters by type
--username filters by username
--endpoint filters by endpoint
--env filters by environment
--apiKey filters by apiKey
```

#### Clear credentials

Use the following command in combination with our filters to delete 1 or more credentials 

`mdctl credentials clear --username john@medable.com`

Available filters are:
```
--type deletes by type
--endpoint deletes by endpoint
--username deletes by username
--env deletes by environment
--apiKey deletes by apiKey
```

#### Get credentials

It's also possible to retrieve the first matching credential by running

`mdctl credentials get`

You can also provide filters to help our tool to decide which credential we want to retrieve
```
--type filters by type
--username filters by username
--endpoint filters by endpoint
--env filters by environment
--apiKey filters by apiKey
```

#### Default credentials

Default credentials can be used to perform operations without having to explicitly specify the
credentials to use, for example:
`mdctl env export //will try to perform the environment export with the default credentials`

The following commands help you to manage the default credentials
```
mdctl credentials default set     //Sets default credentails, see filters below
mdctl credentials default get    //Gets default credentails, see filters below
mdctl credentials default clear //Removes default credentails, see filters below
```

#### Password session
Only if you use credentials of type 'password' you can start a session by doing:

```
mdctl credentials login
```

In order to avoid interactions with the CLI it is possible to use the following filters to narrow down the credentials to use:
```
--username filters by username
--endpoint filters by endpoint
--env filters by environment
--apiKey filters by apiKey
```

If no filters are provided then the CLI will try to use the default credentials (as long as they are type 'password').

If there are no default credentials or if the filters provided return more than 1 result then follow the prompts to choose
the desired credentials.

It is also possible to provide a path to a file with this information by using  `--file path/to/file`

Use `mdctl credentials logout` to end the session.

#### Check current session
Use `mdclt credentials whoami` to get the current authorization state.

#### Clear all credentials
Use `mdctl credentials flush` to remove everything.

## Environments

#### Export Environment

`Note: You must have a credential already set`

If you don't specify any additional parameter it will try to export current default env set on credentials.
```
mdctl env export
```

but you can specify any other credential to use by using any of the arguments that is used by that credential like
```
--env filters by environment
--username filters by username
--endpoint filters by endpoint
--apiKey filters by apiKey
```

```
mdctl env export --env medable
```

You can specify the output format JSON | Yaml, json is used by default
```
mdctl env export --env medable --format yaml
```
You can also specify where you want to export your org configurations
```
mdctl env export --env medable --format yaml --dir /User/my_user/exports/medable
```

It will create the folder if not present, if you don't set `--dir` it will use current location

#### Import Environment

`Note: You must have a credential already set`

If you don't specify any additional parameter it will try to export current default env set on credentials.
```
mdctl env import
```

but you can specify any other credential to use by using any of the arguments that is used by that credential like
```
--env filters by environment
--username filters by username
--endpoint filters by endpoint
--apiKey filters by apiKey
```

You can also specify where you want to take org configs from, by setting `--dir` option
```
mdctl env export --env medable  --dir /User/my_user/exports/medable
```

if you don't set `--dir` it will use current location and try to import from it.
