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

### Run MDCTL in a docker conatiner
```
Steps to run in a container
1. Build the image, docker build -t <Image-Name> --build-arg BRANCH_NAME=<BRANCH-TO-TEST> .
   Note: If no branch is supplied, it will take master as a default branch
2. Run the container, docker run -it --name <CONATINER-NAME> -v <PATH-OF-ANY-FOLDER>:/root/.medable sh
   Once you are inside the conatiner , you can run any mdctl commands. 
   Note: The credentials created on particular conatiner will also be available on another conatiner, but remember to use the same <PATH-OF-ANY-FOLDER> 
```


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
