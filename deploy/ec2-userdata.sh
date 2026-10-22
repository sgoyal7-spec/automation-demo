#!/bin/bash
# EC2 user-data for Amazon Linux 2023 (arm64, t4g.small). Installs Docker + Compose and clones the repo.
# After boot: ssh in, create /opt/automation-demo/.env from .env.example, then `docker compose up -d --build`.
set -euxo pipefail
dnf update -y
dnf install -y docker git
systemctl enable --now docker
usermod -aG docker ec2-user
mkdir -p /usr/local/lib/docker/cli-plugins
ARCH=$(uname -m); [ "$ARCH" = "aarch64" ] && ARCH=aarch64 || ARCH=x86_64
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${ARCH}" -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
git clone https://github.com/sgoyal7-spec/automation-demo.git /opt/automation-demo || true
chown -R ec2-user:ec2-user /opt/automation-demo
