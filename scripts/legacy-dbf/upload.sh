#!/usr/bin/env bash
# Legacy DBF migration — talk to a running SOMS (production or local) through
# the same APIs the admin screens use. Nothing here touches the database
# directly, so every row goes through the importer's validation and audit.
#
#   scripts/legacy-dbf/upload.sh export <dir>   download what the target holds
#                                               (migration workbook + catalog CSV)
#                                               for convert.ts --existing/--catalog
#   scripts/legacy-dbf/upload.sh apply  <dir>   catalog.csv, then every
#                                               migration-NN.xml: validate ALL
#                                               first, commit only if all are clean
#
# Env: SOMS_HOST (default https://soms.jakeshomeappliances.com.vn), SOMS_LOGIN (ADMIN
# username or phone), optional SOMS_PASSWORD_FILE (a chmod-600 file holding
# the password). Without the file the password is asked for. It is never
# passed on the command line. ADMIN only — the migration API refuses anyone else.
#
# ponytail: one-off cutover tool; plain curl + python3 for the JSON.
set -euo pipefail

MODE=${1:-}
DIR=${2:-}
HOST=${SOMS_HOST:-https://soms.jakeshomeappliances.com.vn}
if [[ -z "$MODE" || -z "$DIR" || -z "${SOMS_LOGIN:-}" ]]; then
  echo "usage: SOMS_LOGIN=<admin> $0 export|apply <dir>   (SOMS_HOST defaults to $HOST)" >&2
  exit 1
fi

if [[ -n "${SOMS_PASSWORD_FILE:-}" ]]; then
  PASSWORD=$(<"$SOMS_PASSWORD_FILE")
else
  read -r -s -p "Password for ${SOMS_LOGIN} @ ${HOST}: " PASSWORD; echo
fi
field=$([[ "$SOMS_LOGIN" =~ ^[0-9+]+$ ]] && echo phone || echo username)
TOKEN=$(python3 -c 'import json,sys; print(json.dumps({sys.argv[1]: sys.argv[2], "password": sys.argv[3]}))' \
  "$field" "$SOMS_LOGIN" "$PASSWORD" \
  | curl -fsS -X POST "$HOST/api/auth/login" -H 'content-type: application/json' --data @- \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["accessToken"])')
unset PASSWORD
AUTH=(-H "Authorization: Bearer $TOKEN")

case "$MODE" in
  export)
    mkdir -p "$DIR"
    curl -fsS "${AUTH[@]}" "$HOST/api/admin/migration/export" -o "$DIR/existing-migration.xml"
    curl -fsS "${AUTH[@]}" "$HOST/api/admin/products/export-catalog" -o "$DIR/existing-catalog.csv"
    echo "Saved $DIR/existing-migration.xml and $DIR/existing-catalog.csv"
    ;;

  apply)
    shopt -s nullglob
    PARTS=("$DIR"/migration-*.xml)
    [[ -f "$DIR/catalog.csv" && ${#PARTS[@]} -gt 0 ]] || { echo "No catalog.csv / migration-*.xml in $DIR" >&2; exit 1; }

    echo "== catalog.csv"
    curl -fsS -X POST "${AUTH[@]}" "$HOST/api/admin/products/import-catalog" -F "file=@$DIR/catalog.csv;type=text/csv" \
      | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print("  models +%d  consumables +%d  links +%d  warnings %d" % (d["modelsCreated"], d["consumablesCreated"], d["linksCreated"], len(d["warnings"])))'

    # Validate everything before writing anything: the catalog must already
    # be in for the model codes to resolve, which is why it went first.
    clean=1
    for f in "${PARTS[@]}"; do
      out=$(curl -fsS -X POST "${AUTH[@]}" "$HOST/api/admin/migration/import" -F mode=validate -F "file=@$f;type=application/xml")
      echo "$out" | python3 -c '
import json,sys
x=json.load(sys.stdin)["data"]; name=sys.argv[1]
print("== %s  new %s  skipped %s  errors %d" % (name, x["counts"], x["skipped"], x["errorCount"]))
for e in x["errors"][:20]: print("   %s row %s %s: %s" % (e["sheet"], e["row"], e["column"], e["message"]))
sys.exit(1 if x["errorCount"] else 0)' "$(basename "$f")" || clean=0
    done
    if [[ $clean -ne 1 ]]; then
      echo "Validation found errors — nothing was committed." >&2
      exit 1
    fi

    read -r -p "All ${#PARTS[@]} files are clean. Type COMMIT to write them to ${HOST}: " answer
    [[ "$answer" == "COMMIT" ]] || { echo "Stopped — nothing committed."; exit 1; }

    for f in "${PARTS[@]}"; do
      curl -fsS --max-time 900 -X POST "${AUTH[@]}" "$HOST/api/admin/migration/import" -F mode=commit -F "file=@$f;type=application/xml" \
        | python3 -c '
import json,sys
x=json.load(sys.stdin)["data"]; a=x.get("applied") or {}
print("== %s  committed=%s  %s" % (sys.argv[1], x["committed"], a))
sys.exit(0 if x["committed"] or not x["counts"]["customers"]+x["counts"]["equipment"] else 1)' "$(basename "$f")"
    done
    echo "Done."
    ;;

  *)
    echo "unknown mode: $MODE (export | apply)" >&2
    exit 1
    ;;
esac
