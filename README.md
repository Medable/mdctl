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