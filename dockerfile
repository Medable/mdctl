FROM node:14-alpine

ARG BRANCH_NAME=master

ENV MDCTL_CLI_ENCRYPTION_KEY=_your_key_key_with_enough_bits_1

RUN npm install -g lerna && \
    apk update && \
    apk add git  && \
    apk add --update python2 make g++ && rm -rf /var/cache/apk/*  && \
    apk add pkgconfig && \
    apk add libsecret-dev && \
    git clone --branch $BRANCH_NAME https://github.com/Medable/mdctl.git 

WORKDIR /mdctl

RUN npm install 
RUN lerna bootstrap --hoist

WORKDIR ./packages/mdctl-cli 
RUN npm link

WORKDIR /data
