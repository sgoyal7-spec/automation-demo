#!/bin/bash
# EC2 user-data for Amazon Linux 2023 (arm64, t4g.small). Installs Docker + Compose plugin
# and adds swap so the Next.js image can build on 2 GB RAM.
# The source is copied in afterwards with `deploy/push.sh <host>`; see README.
set -euxo pipefail
dnf update -y
dnf install -y docker git
systemctl enable --now docker
usermod -aG docker ec2-user
mkdir -p /usr/local/lib/docker/cli-plugins
ARCH=$(uname -m)
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${ARCH}" -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
# Compose v5 needs the buildx plugin, which the AL2023 docker package does not ship.
BX=$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | grep -oE '"tag_name": *"v[0-9.]+"' | grep -oE 'v[0-9.]+')
BXARCH=$([ "$ARCH" = "aarch64" ] && echo arm64 || echo amd64)
curl -fsSL "https://github.com/docker/buildx/releases/download/${BX}/buildx-${BX}.linux-${BXARCH}" -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
mkdir -p /opt/automation-demo && chown ec2-user:ec2-user /opt/automation-demo
touch /var/tmp/userdata-done
