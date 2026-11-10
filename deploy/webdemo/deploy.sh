#!/usr/bin/env bash
# /srv/kas-web/bin/deploy.sh — KAS test system (staging) https://webdemo.kasbookingapp.com
#
#   deploy.sh <release-tarball>   deploy a source snapshot (backend/ + frontend/ + docker/)
#   deploy.sh --rollback          start the previous release again (current <-> previous)
#   deploy.sh --status            show current / previous release and container health
#
# A deploy:
#   1. unpacks the tarball into releases/<name>
#   2. builds the three images from releases/<name>; the running stack is not touched
#   3. dumps database kas_web_dev to data/backups/predeploy
#   4. starts <name> and waits until backend, website and console are healthy
#   5. success: current-release=<name>, previous-release=<old current>
#      failure: the old release is started again and <name> (dir + images) is removed
# No database rollback: Flyway migrations are forward-only. If a migration must be undone,
# restore the dump printed in step 3 by hand.
#
# One deploy at a time (flock). Keeps the 5 newest releases plus current and previous,
# and removes the images of every release it removes.
# Canonical copy: kas-web-full deploy/webdemo/deploy.sh (installed by hand, see README there).
set -Eeuo pipefail
umask 022
cd /srv/kas-web

KEEP_RELEASES=5
SERVICES=(backend website console)

log()  { printf '\n==> [%s] %s\n' "$(date '+%F %T')" "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

exec 9>/srv/kas-web/.deploy.lock
flock -w 900 9 || die "another deploy is still running"

set -a; source ./.env; set +a

CUR="$(cat current-release 2>/dev/null || true)"
PREV="$(cat previous-release 2>/dev/null || true)"

compose() { local rel="$1"; shift; RELEASE="$rel" docker compose "$@"; }

images_exist() {   # $1 = release
  local s
  for s in "${SERVICES[@]}"; do docker image inspect "kas-web-$s:$1" >/dev/null 2>&1 || return 1; done
}

wait_healthy() {   # $1 = release; ~4 minutes (backend start_period is 120 s)
  local i s id st all
  for i in $(seq 1 40); do
    all=1
    for s in "${SERVICES[@]}"; do
      id="$(compose "$1" ps -q "$s" 2>/dev/null || true)"
      st=missing
      [[ -n "$id" ]] && st="$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo missing)"
      [[ "$st" == healthy ]] || all=0
    done
    (( all )) && return 0
    sleep 6
  done
  return 1
}

start_release() {  # $1 = release
  ln -sfn "releases/$1" current
  compose "$1" up -d --remove-orphans
}

remove_release() { # $1 = release; never the running or the previous one
  [[ -n "$1" && "$1" != "$CUR" && "$1" != "$PREV" ]] || return 0
  rm -rf -- "releases/$1"
  local s
  for s in "${SERVICES[@]}"; do docker image rm "kas-web-$s:$1" >/dev/null 2>&1 || true; done
}

prune() {
  local r n=0 tag
  # releases: keep the newest KEEP_RELEASES, always keep current + previous
  while IFS= read -r r; do
    n=$((n + 1))
    if (( n > KEEP_RELEASES )); then remove_release "$r"; fi
  done < <(ls -1t releases 2>/dev/null)
  # images whose release directory is gone
  while IFS= read -r tag; do
    if [[ -d "releases/$tag" ]]; then continue; fi
    for r in "${SERVICES[@]}"; do docker image rm "kas-web-$r:$tag" >/dev/null 2>&1 || true; done
  done < <(docker images --format '{{.Tag}}' --filter 'reference=kas-web-*' | sort -u)
  # uploaded tarballs and deploy logs
  ls -1t incoming/webdemo-*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm -f --
  ls -1t incoming/deploy-*.log     2>/dev/null | tail -n +21 | xargs -r rm -f --
  docker image prune -f >/dev/null
}

status() {
  echo "current:  ${CUR:--}"
  echo "previous: ${PREV:--}"
  [[ -n "$CUR" ]] && compose "$CUR" ps --format 'table {{.Service}}\t{{.Status}}'
  return 0
}

# ------------------------------------------------------------------ --status
if [[ "${1:-}" == "--status" ]]; then status; exit 0; fi

# ------------------------------------------------------------------ --rollback
if [[ "${1:-}" == "--rollback" ]]; then
  [[ -n "$PREV" && -d "releases/$PREV" ]] || die "no previous release to roll back to"
  images_exist "$PREV" || die "images of $PREV are gone; deploy it again instead"
  log "Rollback $CUR -> $PREV (the database is NOT rolled back)"
  start_release "$PREV"
  if wait_healthy "$PREV"; then
    echo "$PREV" > current-release
    echo "$CUR"  > previous-release
    log "OK: $PREV is running (previous: $CUR)"
    exit 0
  fi
  log "FAILED - $PREV is not healthy, starting $CUR again"
  compose "$PREV" logs --tail=60 backend || true
  start_release "$CUR"
  wait_healthy "$CUR" || log "WARNING: $CUR is not healthy either"
  exit 1
fi

# ------------------------------------------------------------------ deploy
TARBALL="${1:?usage: deploy.sh <release-tarball> | --rollback | --status}"
[[ -f "$TARBALL" ]] || die "no such file: $TARBALL"
NAME="$(basename "$TARBALL" .tar.gz)"
[[ "$NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$ ]] || die "bad release name: $NAME"
[[ "$NAME" != "$CUR" && "$NAME" != "$PREV" ]] || die "$NAME is the current or previous release"

failed() {         # remove the half-made release, leave the running stack alone
  log "FAILED before start: $*"
  remove_release "$NAME"
  exit 1
}

log "Unpack $NAME (running: ${CUR:-none})"
rm -rf -- "releases/$NAME"
mkdir -p "releases/$NAME"
tar -xzf "$TARBALL" -C "releases/$NAME" --no-same-owner || failed "tarball does not unpack"
[[ -d "releases/$NAME/backend" && -d "releases/$NAME/frontend" ]] || failed "tarball has no backend/ and frontend/"
[[ -f "releases/$NAME/docker/website.Dockerfile" && -f "releases/$NAME/docker/console.Dockerfile" ]] \
  || failed "tarball has no docker/website.Dockerfile and docker/console.Dockerfile"

log "Build images"
compose "$NAME" build backend || failed "backend image"
compose "$NAME" build website console || failed "website/console image"

log "Back up database kas_web_dev"
mkdir -p data/backups/predeploy
DUMP="data/backups/predeploy/kas-web-$NAME.dump"
sudo -u postgres pg_dump -d kas_web_dev -Fc -f "/tmp/kas-web-$NAME.dump" || failed "pg_dump"
mv "/tmp/kas-web-$NAME.dump" "$DUMP"
ls -1t data/backups/predeploy/*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f --
echo "dump: /srv/kas-web/$DUMP"

log "Start $NAME (Flyway migrates on backend start)"
start_release "$NAME" || true

log "Wait for healthy"
if ! wait_healthy "$NAME"; then
  compose "$NAME" ps || true
  compose "$NAME" logs --tail=80 backend console website || true
  if [[ -n "$CUR" ]] && images_exist "$CUR"; then
    log "FAILED - starting $CUR again"
    start_release "$CUR"
    if wait_healthy "$CUR"; then
      log "Back on $CUR. If $NAME applied a migration $CUR cannot run with, restore $DUMP"
    else
      log "WARNING: $CUR is not healthy either. Restore $DUMP, then: deploy.sh --rollback"
    fi
  fi
  remove_release "$NAME"
  exit 1
fi

echo "$NAME" > current-release
[[ -n "$CUR" ]] && echo "$CUR" > previous-release
PREV="$CUR"; CUR="$NAME"
prune
log "Done: $NAME (previous: ${PREV:--})"
