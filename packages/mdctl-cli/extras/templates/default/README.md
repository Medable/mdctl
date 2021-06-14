# Axon/Org

This is the core Axon Org configuration, which is the basis for all axon deployments.

### How to operate this repo

- Install mdctl tools `npm install -g @medable/mdctl-cli`
- Login to environment by `mdctl credentials login`
- change directory to "configuration" prior to executing the `mdctl env` commands
  - Then to pull from the environment `mdctl env export`
  - To push stuff back to the enviornment `mdctl env import`
- [mdctl Command Line Interface Options](https://github.com/Medable/mdctl/blob/master/packages/mdctl-cli/README.md)

### CR process

We follow gitflow process as we do for other projects.

### Testing

Tests can be performed on orgs in the `int-dev` environment. To run the tests you must have the following 4 environment variables exported:

* `JEST_ENV`: The org code for the test org eg. `hybridunitest`.
* `JEST_TOKEN`: A JWT token for an administrator account on the target test org
* `JEST_API_KEY`: API key for an application in the target org
* `JEST_ENDPOINT`: Environment endpoint, defaults to 'api-int-dev.medable.com'

You may want to use a tool like [autoenv](https://github.com/kennethreitz/autoenv) or [direnv](https://direnv.net) so you don't have to set these keys automatically.

Once these are set, run tests like so:

```
npm install
npm test
```
__Do not run the tests in working orgs like `axondev` or `hybridstudy`__

#### Test structure

This is a short description of `__tests__` structure
- api: an `mdctl-api` wrapper tailored to our needs
- global: setup and teardown process:
    - during setup we read every provisioning file and we provision the environment
    - during teardown we attempt to remove all the provisioned data
    - after provisioning a file called `provisioned-data.json` is generated under `./provisioner`
- helpers: utilities
- provisioner: logic to provision the environment
- AXONCONFIG-*: these directories are the tests per ticket
    - `*.provisioning.js` these files are for provisioning, they should follow the naming convention `TICKET.provisioning.js`
    - `*.test.js` the actual test files

### Ephemeral Org Provisioning

Create a new ephemeral org for testing.

- Make sure your manifest.json doesn't have any unintended changes
- Run `docker build -f ./ops/dockerfile -t containers-environment .`
- Once the image is built: `docker run --cap-add=IPC_LOCK --env TTL=100000  containers-environment:latest` (TTL env variable sets the time-to-live for the environment in milliseconds, defaults to 1 hour)
