#!/bin/sh
# Nightly offsite backup (docs/DEPLOY.md §9, note 09 §1.4): pg_dump (custom format) | age (encrypted to the public key
# BACKUP_AGE_RECIPIENT; the private key stays offline) -> Cloudflare R2 (S3 API, lifecycle deletes after 35 days).
#
# Fails closed (final review, 2026-10-29): without pipefail a failed pg_dump left an empty or partial dump that age
# still encrypted, the upload still ran and the job still printed "done". Now ANY failure (a missing variable, pg_dump,
# age, a dump below BACKUP_MIN_BYTES, the upload) prints one JSON line job.db_backup.failed { step } and exits 1, and
# nothing is uploaded unless every earlier step succeeded. Must EXIT when done: Railway skips the next cron run while
# one is still active. Never prints a secret (DATABASE_URL and the keys stay out of every line).
#
# Variables: DATABASE_URL (${{Postgres.DATABASE_URL}}), BACKUP_AGE_RECIPIENT (age1…), BACKUP_BUCKET,
# BACKUP_S3_ENDPOINT (https://<account>.r2.cloudflarestorage.com), AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (an R2
# token limited to that bucket), optional BACKUP_MIN_BYTES (default 4096; an encrypted dump of the empty schema is
# larger than that).
set -eu
# A pipeline fails when pg_dump fails, not only when age does. A shell without pipefail must not run this at all.
if ! (set -o pipefail) 2>/dev/null; then
  echo '{"level":"error","message":"job.db_backup.failed","event":"job.db_backup.failed","step":"shell","reason":"no pipefail"}'
  exit 1
fi
set -o pipefail

log() { # level event [extra JSON members, without braces]
  printf '{"time":"%s","level":"%s","message":"%s","event":"%s"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$2" "${3:+,$3}"
}

step=start
file=""
on_exit() {
  status=$?
  [ -n "$file" ] && rm -f "$file"
  if [ "$status" -ne 0 ]; then
    log error job.db_backup.failed "\"step\":\"$step\",\"exitCode\":$status"
  fi
}
trap on_exit EXIT

step=env
: "${DATABASE_URL:?}" "${BACKUP_AGE_RECIPIENT:?}" "${BACKUP_BUCKET:?}" "${BACKUP_S3_ENDPOINT:?}"
: "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}"
min_bytes="${BACKUP_MIN_BYTES:-4096}"
started=$(date +%s)
ts=$(date -u +%Y%m%dT%H%M%SZ)
file="/tmp/waqaya-$ts.dump.age"
key="postgres/waqaya-$ts.dump.age"

step=dump
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" | age -r "$BACKUP_AGE_RECIPIENT" > "$file"

step=check
bytes=$(wc -c < "$file" | tr -d ' ')
[ "$bytes" -ge "$min_bytes" ]
[ "$(head -c 21 "$file")" = "age-encryption.org/v1" ]

step=upload
AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
  aws s3 cp "$file" "s3://$BACKUP_BUCKET/$key" --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors

step=done
log info job.db_backup.done "\"bytes\":$bytes,\"key\":\"$key\",\"seconds\":$(( $(date +%s) - started ))"
