#!/usr/bin/env bash
set -euo pipefail
umask 077

project_dir="$HOME/Docker/baby-welcome"
backup_dir="$HOME/Docker/backup/atlas"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
exec 9>"$backup_dir/.snapshot.lock"
flock -n 9 || exit 0

compose=(docker compose --project-directory "$project_dir/deploy" -f "$project_dir/deploy/compose.server.yaml")
stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
temporary_dir="$(mktemp -d "$backup_dir/.snapshot-XXXXXX")"
container_backup="/app/data/atlas-backup-$stamp.sqlite"

cleanup() {
  rm -rf -- "$temporary_dir"
  "${compose[@]}" exec -T atlas node -e 'require("node:fs").rmSync(process.argv[1], { force: true })' "$container_backup" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${compose[@]}" exec -T atlas node server/manage.js backup "$container_backup"
"${compose[@]}" cp "atlas:$container_backup" "$temporary_dir/atlas.sqlite"
test -s "$temporary_dir/atlas.sqlite"
chmod 600 "$temporary_dir/atlas.sqlite"
cp "$project_dir/.env" "$temporary_dir/server.env"
cp "$project_dir/deploy/compose.server.yaml" "$temporary_dir/compose.server.yaml"
cp "$project_dir/deploy/backup-server.sh" "$temporary_dir/backup-server.sh"
cp "$project_dir/deploy/atlas-backup.service" "$temporary_dir/atlas-backup.service"
cp "$project_dir/deploy/atlas-backup.timer" "$temporary_dir/atlas-backup.timer"
mv -- "$temporary_dir" "$backup_dir/$stamp"
printf 'Atlas snapshot saved to %s/%s\n' "$backup_dir" "$stamp"