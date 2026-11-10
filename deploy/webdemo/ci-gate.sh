#!/usr/bin/env bash
# /srv/kas-web/bin/ci-gate.sh — the only thing the GitLab CI key may run on kas-staging.
#
# ~/.ssh/authorized_keys on root@202.143.110.15:
#   restrict,command="/srv/kas-web/bin/ci-gate.sh" ssh-ed25519 AAAA... gitlab-ci kas-web-full webdemo
#
# Allowed commands (SSH_ORIGINAL_COMMAND):
#   deploy <release-name>   release tarball (git archive ... | gzip) on stdin
#   rollback
#   status
# Anything else is refused. No shell, no scp, no port forwarding.
# Canonical copy: kas-web-full deploy/webdemo/ci-gate.sh
set -Eeuo pipefail
cd /srv/kas-web

MAX_BYTES=$((300 * 1024 * 1024))
read -r -a ARGS <<< "${SSH_ORIGINAL_COMMAND:-}"
CMD="${ARGS[0]:-}"
logger -t kas-ci-gate -- "from ${SSH_CLIENT%% *}: ${SSH_ORIGINAL_COMMAND:-<none>}" || true

case "$CMD" in
  deploy)
    [[ ${#ARGS[@]} -eq 2 ]] || { echo "usage: deploy <release-name>" >&2; exit 2; }
    NAME="${ARGS[1]}"
    [[ "$NAME" =~ ^webdemo-[0-9]{8}-[0-9]{4}-[0-9a-f]{7,40}$ ]] || { echo "bad release name: $NAME" >&2; exit 2; }
    mkdir -p incoming
    TAR="incoming/$NAME.tar.gz"
    head -c "$MAX_BYTES" > "$TAR"
    [[ $(stat -c %s "$TAR") -lt $MAX_BYTES ]] || { rm -f "$TAR"; echo "tarball too large" >&2; exit 2; }
    gzip -t "$TAR" || { rm -f "$TAR"; echo "tarball is not a valid gzip" >&2; exit 2; }
    rc=0
    /srv/kas-web/bin/deploy.sh "/srv/kas-web/$TAR" < /dev/null 2>&1 | tee "incoming/deploy-$NAME.log" || rc=${PIPESTATUS[0]}
    exit "$rc"
    ;;
  rollback) exec /srv/kas-web/bin/deploy.sh --rollback 2>&1 ;;
  status)   exec /srv/kas-web/bin/deploy.sh --status 2>&1 ;;
  *) echo "refused: allowed commands are deploy <name> | rollback | status" >&2; exit 2 ;;
esac
