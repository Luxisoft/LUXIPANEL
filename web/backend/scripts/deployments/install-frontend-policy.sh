#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]]
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
backup=$(mktemp -d /var/backups/luxisoft-frontend-policy.XXXXXX)
for name in deployment-helper deployment-tenant.mjs deployment-gateway.mjs runtime-policy.mjs deployment_policy.py frontend-handoff.mjs frontend-temporary-gc.py static-build-scratch.py; do
  if [[ -e /usr/lib/luxipanel/$name ]]; then cp -a "/usr/lib/luxipanel/$name" "$backup/"; fi
done
if [[ -e /etc/luxisoft-development-runtime/policy.json ]]; then
  /usr/bin/python3 -I "$source_dir/install-metered-helper.py"
else
  install -m 0755 "$source_dir/deployment-helper.py" /usr/lib/luxipanel/deployment-helper
fi
for name in deployment-tenant.mjs deployment-gateway.mjs runtime-policy.mjs deployment_policy.py frontend-handoff.mjs frontend-temporary-gc.py static-build-scratch.py; do install -m 0755 "$source_dir/$name" "/usr/lib/luxipanel/$name"; done
cat > /etc/systemd/system/luxisoft-frontend-temporary-gc.service <<'EOF'
[Unit]
Description=Recover interrupted frontend build temporary storage
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 -I /usr/lib/luxipanel/frontend-temporary-gc.py
Nice=10
IOSchedulingClass=idle
EOF
cat > /etc/systemd/system/luxisoft-frontend-temporary-gc.timer <<'EOF'
[Unit]
Description=Recover frontend build temporary storage every minute
[Timer]
OnBootSec=60s
OnUnitActiveSec=60s
AccuracySec=1s
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now luxisoft-frontend-temporary-gc.timer
if systemctl is-active --quiet luxisoft-project-gateway.service; then systemctl restart luxisoft-project-gateway.service; fi
printf 'Backup: %s\n' "$backup"
