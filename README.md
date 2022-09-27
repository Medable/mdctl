# Medable Developer Tools

### Install Dependencies

`npm install`

#### Install packages dependencies and link them

`lerna bootstrap --hoist`

### Using local npm registry

```
docker pull verdaccio/verdaccio
docker run -it --rm --name verdaccio -p 4873:4873 verdaccio/verdaccio
or use any of these configurations: https://github.com/verdaccio/docker-examples

npm adduser --registry http://localhost:4873

npm login

## You can check pages navigating http://localhost:4873

```

### Publish packages
```
lerna publish --no-git-tag-version --no-push --registry=http://localhost:4873
```

#### Run test
`lerna run test`

### Run MDCTL in a docker container
Steps to run in a container
1. Build the image
        `docker build -t <IMAGE-NAME> --build-arg BRANCH_NAME=<BRANCH-TO-TEST> .`
   Note: If no branch is supplied, it will take master as a default branch
2. To store the credentials, 
   - create a folder in your home directory, this folder will be shared across multiple containers
   - move into that folder using `cd`
   - copy the full path of that folder using `pwd`
   - run the below command to add the credentials
        `docker run -it  -v <CREDENTIAL-FOLDER>:/root/.medable <IMAGE-NAME> mdctl credentials add`
   - likewise you can run any mdctl command

3. But, to run any mdctl export or import command you need to 
   - create a folder in your home directory, this will contain the exported or the imported data
   - move into that folder using `cd`
   - if trying to run import command copy the manifest and other files in this folder
   - if trying to run export command, after running the export command this folder will contain the exported data
   - copy the full path of that folder using `pwd`
   - if you are using crdentials type token for the env run the below command to export
        `docker run -it  -v <CREDENTIAL-FOLDER>:/root/.medable -v <DATA-FOLDER>:/data <IMAGE-NAME> mdctl env export --env <YOUR-ENV>`
   - likewise you can run the import command as well
   - if you are using password as a credentials type, then you need to be on the same session
        - You can log in to the container
            `docker run -it  -v <CREDENTIAL-FOLDER>:/root/.medable -v <DATA-FOLDER>:/data <IMAGE-NAME> sh`
        - You can login to your env and run the command
            ```
            mdctl credentials login
            mdctl study export
            ```

Note: Remove all the stopped container which might have taken unecessary space 
    `docker container prune`

#### Packages

[mdctl-api](packages/mdctl-api/README.md)

[mdctl-cli](packages/mdctl-cli/README.md)

[mdctl-core](packages/mdctl-core/README.md)

[mdctl-core-schemas](packages/mdctl-core-schemas/README.md)

[mdctl-core-utils](packages/mdctl-core-utils/README.md)

[mdctl-credentials-provider-keychain](packages/mdctl-credentials-provider-keychain/README.md)

[mdctl-credentials-provider-pouchdb](packages/mdctl-credentials-provider-pouchdb/README.md)

[mdctl-export-adapter-console](packages/mdctl-export-adapter-console/README.md)

[mdctl-export-adapter-tree](packages/mdctl-export-adapter-tree/README.md)

[mdctl-import-adapter](packages/mdctl-import-adapter/README.md)

[mdctl-manifest](packages/mdctl-manifest/README.md)

[mdctl-sandbox](packages/mdctl-sandbox/README.md)
