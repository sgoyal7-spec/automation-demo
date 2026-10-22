#!/bin/bash
# Copy the source tree to the host and (re)build the containers.
# Usage: deploy/push.sh <host-or-ip> [ssh-key]
set -euo pipefail
HOST=${1:?host required}; KEY=${2:-~/.ssh/automation-demo.pem}
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new ec2-user@$HOST"
cd "$(dirname "$0")/.."
tar --exclude=node_modules --exclude=.next --exclude=data --exclude=.git --exclude=.env -czf - . | $SSH "mkdir -p /opt/automation-demo && tar -xzf - -C /opt/automation-demo"
$SSH "cd /opt/automation-demo && [ -f .env ] || echo 'WARNING: create /opt/automation-demo/.env before starting'"
$SSH "cd /opt/automation-demo && docker compose up -d --build"
