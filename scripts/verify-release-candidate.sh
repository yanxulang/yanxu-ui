#!/usr/bin/env bash
set -euo pipefail

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "缺少 SHA-256 工具" >&2
    return 127
  fi
}

root=$(dirname "$0")/..
candidate=${CANDIDATE_DIR:?必须设置候选目录}
report=${REPORT:?必须设置报告路径}
source_sha=${SOURCE_SHA:-local}
version=$(sed -n 's/^版本 = "\([^"]*\)"$/\1/p' "$root/言序.toml")
test -n "$version"
manifest_sha=$(sha256_file "$root/言序.toml")
example_manifest_sha=$(sha256_file "$root/examples/言序.toml")

prefix="yanxu-ui-$version"
archive="$candidate/$prefix-six-targets.tar.gz"
checksum_file="$candidate/$prefix-six-targets.sha256"
manifest="$candidate/$prefix.toml"
api="$candidate/api-v1.json"

test "$(find "$candidate" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')" -eq 4
test "$(find "$candidate" -mindepth 1 -maxdepth 1 -type f | wc -l | tr -d ' ')" -eq 4
test -f "$archive"
test -f "$checksum_file"
test -f "$manifest"
test -f "$api"

test "$(wc -l < "$checksum_file" | tr -d ' ')" -eq 1
expected=$(awk '{print $1}' "$checksum_file")
test "$(awk '{print $2}' "$checksum_file")" = "$(basename "$archive")"
actual=$(sha256_file "$archive")
test "$expected" = "$actual"
cmp "$manifest" "$root/言序.toml"
cmp "$api" "$root/api/api-v1.json"
cmp "$api" "$root/api/api-v1.freeze.json"

temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
listing="$temporary/archive.list"
verbose="$temporary/archive.verbose"
tar -tzf "$archive" > "$listing"
tar -tvzf "$archive" > "$verbose"

if awk -v prefix="$prefix/" '
  index($0, prefix) != 1 || $0 ~ /(^|\/)\.\.($|\/)/ || $0 ~ /^\// { exit 1 }
' "$listing"; then
  :
else
  echo "候选归档包含越界路径" >&2
  exit 1
fi
if awk 'substr($1, 1, 1) != "-" && substr($1, 1, 1) != "d" { exit 1 }' "$verbose"; then
  :
else
  echo "候选归档不得包含链接或特殊文件" >&2
  exit 1
fi

test "$(grep -Ec "^$prefix/locks/[^/]+/[^/]+$" "$listing")" -eq 6
test "$(grep -Ec "^$prefix/locks/[^/]+/examples/[^/]+$" "$listing")" -eq 6
test "$(grep -Ec "^$prefix/build/targets/[^/]+/[^/]+$" "$listing")" -eq 18

for file in 言序.toml api/api-v1.json api/api-v1.freeze.json api/compatibility-v1.json api/supply-chain-v1.json api/release-contract-v1.json; do
  tar -xOf "$archive" "$prefix/$file" > "$temporary/$(basename "$file")"
  cmp "$root/$file" "$temporary/$(basename "$file")"
done
tar -xOf "$archive" "$prefix/examples/言序.toml" > "$temporary/examples-manifest.toml"
cmp "$root/examples/言序.toml" "$temporary/examples-manifest.toml"

mkdir -p "$(dirname "$report")"
{
  printf 'format=1\nversion=%s\nsource_sha=%s\narchive_sha256=%s\n' \
    "$version" "$source_sha" "$actual"
  printf 'manifest_sha256=%s\napi_sha256=%s\n' \
    "$manifest_sha" \
    "$(sha256_file "$api")"
  printf 'api_freeze_sha256=%s\ncompatibility_sha256=%s\nsupply_chain_sha256=%s\nrelease_contract_sha256=%s\n' \
    "$(sha256_file "$root/api/api-v1.freeze.json")" \
    "$(sha256_file "$root/api/compatibility-v1.json")" \
    "$(sha256_file "$root/api/supply-chain-v1.json")" \
    "$(sha256_file "$root/api/release-contract-v1.json")"
} > "$report"

for target in \
  x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu \
  x86_64-apple-darwin aarch64-apple-darwin \
  x86_64-pc-windows-msvc aarch64-pc-windows-msvc
do
  root_lock="$prefix/locks/$target/言序.lock"
  example_lock="$prefix/locks/$target/examples/言序.lock"
  app_root="$prefix/build/targets/$target/自动关闭冒烟.yxb"
  runtime="$app_root.runtime"
  app_checksum="$app_root.sha256"

  tar -xOf "$archive" "$root_lock" > "$temporary/$target.root.lock"
  tar -xOf "$archive" "$example_lock" > "$temporary/$target.example.lock"
  grep -Fx "target = \"$target\"" "$temporary/$target.root.lock" >/dev/null
  grep -Fx "target = \"$target\"" "$temporary/$target.example.lock" >/dev/null
  for lock in "$temporary/$target.root.lock" "$temporary/$target.example.lock"; do
    grep -Fx 'lock_version = 2' "$lock" >/dev/null
    grep -Fx 'generator = "1.1.9"' "$lock" >/dev/null
    grep -Fx 'revision = "9b6bce794a2e23fba04340f762e3d8f49a2724ff"' "$lock" >/dev/null
    grep -Fx 'revision = "765d9dd623db901a3e71aa4759dbcd77563cb3a9"' "$lock" >/dev/null
  done
  grep -Fx "manifest_checksum = \"$manifest_sha\"" "$temporary/$target.root.lock" >/dev/null
  grep -Fx "manifest_checksum = \"$example_manifest_sha\"" "$temporary/$target.example.lock" >/dev/null
  test "$(grep -c '^\[\[package\]\]$' "$temporary/$target.root.lock")" -eq 2
  test "$(grep -c '^\[\[package\]\]$' "$temporary/$target.example.lock")" -eq 3
  grep -Fx 'name = "yanxu-ui"' "$temporary/$target.example.lock" >/dev/null
  grep -Fx "version = \"$version\"" "$temporary/$target.example.lock" >/dev/null
  grep -Fx 'source = "path:.."' "$temporary/$target.example.lock" >/dev/null

  tar -xOf "$archive" "$app_root" > "$temporary/$target.yxb"
  tar -xOf "$archive" "$runtime" > "$temporary/$target.runtime"
  tar -xOf "$archive" "$app_checksum" > "$temporary/$target.sha256"
  grep -Fx 'runtime=1.1.20' "$temporary/$target.runtime" >/dev/null
  grep -Fx "target=$target" "$temporary/$target.runtime" >/dev/null
  test "$(wc -l < "$temporary/$target.runtime" | tr -d ' ')" -eq 2
  test "$(wc -l < "$temporary/$target.sha256" | tr -d ' ')" -eq 1
  test "$(awk '{print $2}' "$temporary/$target.sha256")" = '自动关闭冒烟.yxb'
  app_sha=$(sha256_file "$temporary/$target.yxb")
  test "$app_sha" = "$(awk '{print $1}' "$temporary/$target.sha256")"
  app_size=$(wc -c < "$temporary/$target.yxb" | tr -d ' ')
  root_lock_sha=$(sha256_file "$temporary/$target.root.lock")
  example_lock_sha=$(sha256_file "$temporary/$target.example.lock")
  printf 'target=%s root_lock_sha256=%s example_lock_sha256=%s app_sha256=%s app_size=%s\n' \
    "$target" "$root_lock_sha" "$example_lock_sha" "$app_sha" "$app_size" >> "$report"
done

test "$(grep -c '^target=' "$report")" -eq 6
echo "言界六目标发布候选演练通过"
