#!/usr/bin/env bash
# /srv/kas-web/bin/backup.sh - daily dump of the demo database (cron 01:30), keeps 14.
set -Eeuo pipefail
cd /srv/kas-web
mkdir -p data/backups/db
f="kas_web_dev-$(date +%Y%m%d-%H%M%S).dump"
sudo -u postgres pg_dump -d kas_web_dev -Fc -f "/tmp/$f" && mv "/tmp/$f" data/backups/db/
ls -t data/backups/db/*.dump | tail -n +15 | xargs -r rm -f
