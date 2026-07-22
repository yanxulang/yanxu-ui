#!/bin/sh
set -eu

root=$(dirname "$0")/..

core=${YANXU_BIN:-yanxu}
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM

"$core" 文 --json "$root/src/主.yx" "$temporary/api-v1.json"
"$core" 文 "$root/src/主.yx" "$temporary/REFERENCE.md"
cmp "$root/api/api-v1.json" "$temporary/api-v1.json"
cmp "$root/docs/REFERENCE.md" "$temporary/REFERENCE.md"
echo "言界 API 快照与生成文档一致"
