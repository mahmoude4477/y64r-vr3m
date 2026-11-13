# Nightly offsite backup of the production database (Railway cron service "db-backup", root directory ops/db-backup,
# schedule 45 23 * * * UTC = 02:45 Riyadh, restart policy NEVER; docs/DEPLOY.md §9).
# pg_dump must be >= the server's major version (Railway Postgres 18). /bin/sh is BusyBox ash (supports pipefail).
FROM postgres:18-alpine
RUN apk add --no-cache aws-cli age
COPY backup.sh /backup.sh
CMD ["/bin/sh", "/backup.sh"]
