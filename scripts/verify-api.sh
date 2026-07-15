#!/bin/sh
set -eu

workspace=$PWD
if test -f "$workspace/yanxu-ui/言序.toml"; then
  root="$workspace/yanxu-ui"
elif test -f "$workspace/言序.toml" && test -f "$workspace/src/主.yx"; then
  root="$workspace"
else
  echo "请从言序多仓工作区根目录或 yanxu-ui 仓库根目录运行" >&2
  exit 1
fi

core=${YANXU_BIN:-yanxu}
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM

"$core" 文 --json "$root/src/主.yx" "$temporary/api-v1.json"
"$core" 文 "$root/src/主.yx" "$temporary/REFERENCE.md"
cmp "$root/api/api-v1.json" "$temporary/api-v1.json"
cmp "$root/docs/REFERENCE.md" "$temporary/REFERENCE.md"
echo "言界 API 快照与生成文档一致"
