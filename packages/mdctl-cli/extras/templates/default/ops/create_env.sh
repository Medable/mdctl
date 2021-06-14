#!/bin/bash

export $(dbus-launch)
dbus-launch
gnome-keyring-daemon --start --daemonize --components=secrets
echo '<RANDOM-PASSPHRASE>' | gnome-keyring-daemon -r -d --unlock
export DEV_AXON_DEPLOYER=$(cat tokens.json | jq -r ".axonDeployer")
export DEV_ORG_PROVISIONER=$(cat tokens.json | jq -r ".orgProvisioner")
export MDCTL_CLI_TOKEN=$DEV_ORG_PROVISIONER
export MDCTL_CLI_TYPE=token 
export MDCTL_CLI_ENV=int-dev.medable
mdctl configure --experimental true
mdctl creds add
mdctl creds auth
mdctl env provision --email $1 --password $2 --ttl-ms $3 > org.json
export TEMP_ORG_ID=$(cat org.json | jq -r ".org._id") 
export TEMP_TOKEN=$(cat org.json | jq -r ".token") 
export TEMP_ORG_CODE=$(cat org.json | jq -r ".org.code")
export TEMP_ENV=int-dev.$TEMP_ORG_CODE 
mdctl creds clear
export MDCTL_CLI_TOKEN=$DEV_AXON_DEPLOYER
mdctl creds add
mdctl creds auth
mdctl api put /routes/md-axon/enable/$TEMP_ORG_CODE
mdctl creds clear
export MDCTL_CLI_ENV=$TEMP_ENV
export MDCTL_CLI_TOKEN=$TEMP_TOKEN
mdctl creds add
mdctl creds auth
mdctl api put /orgs/$TEMP_ORG_ID --file ops/updateorg.json
mdctl api post /orgs/$TEMP_ORG_ID/apps --file ops/appcreate.json > newApps.json
mdctl api post /cache/key/nucleus:publicIdentifierPattern --file ops/cachekey.json
export TEMP_API_KEY=$(cat newApps.json | jq -r ".data[1].clients[0].key")

cd configuration
mdctl env import
cd ../

sed "s/%KEY%/$TEMP_API_KEY/g" ops/tokenScript.js > uTokenScript.js
mdctl sb uTokenScript.js > newToken.json
export JEST_TOKEN=$(cat newToken.json | jq -r ".token") 
export JEST_API_KEY=$TEMP_API_KEY
export JEST_ENV=$TEMP_ORG_CODE
echo "export JEST_TOKEN=${JEST_TOKEN}" >> .env
echo "export JEST_API_KEY=${JEST_API_KEY}" >> .env
echo "export JEST_ENV=${JEST_ENV}" >> .env
cat .env