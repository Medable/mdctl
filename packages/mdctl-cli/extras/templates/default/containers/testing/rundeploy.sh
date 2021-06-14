#!/bin/bash
# this is to stop the error around X11 not running
mkdir /root/.cache
export $(dbus-launch)
dbus-launch
gnome-keyring-daemon --start --daemonize --components=secrets
echo '<RANDOM-PASSPHRASE>' | gnome-keyring-daemon -r -d --unlock
export DEV_AXON_DEPLOYER=$(cat tokens.json | jq -r ".axonDeployer")

export MDCTL_CLI_TYPE=token 
export MDCTL_CLI_ENV=int-dev.medable
export MDCTL_CLI_TOKEN=$DEV_AXON_DEPLOYER
mdctl creds add
mdctl creds list
mdctl axon enable marriott-mental-movement --env=medable