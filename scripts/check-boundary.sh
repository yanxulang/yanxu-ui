#!/bin/sh
set -eu

root=$(dirname "$0")/..

for token in Win32 HWND AppKit NSWindow Cocoa Wayland X11 Direct2D DirectWrite CoreGraphics Metal; do
  if grep -RIn --include='*.yx' "$token" "$root/src"; then
    echo "言界源码不得直接引用平台对象：$token" >&2
    exit 1
  fi
done

test "$(find "$root/examples" -type f -name '*.yx' | wc -l | tr -d ' ')" -eq 15
test "$(grep -c '^公 类 ' "$root/src/主.yx")" -ge 16
grep -F '引「包:言台」' "$root/src/主.yx" >/dev/null
grep -F '引「包:言据」' "$root/src/样式/配置.yx" >/dev/null

if find "$root" \
  \( -path "$root/.git" -o -path "$root/.yanxu" -o -path "$root/target" \) -prune -o \
  -type f \( -name '*.dll' -o -name '*.dylib' -o -name '*.so' \) -print | grep .; then
  echo "言界不得携带自有原生动态库" >&2
  exit 1
fi

echo "言界平台边界、控件数量和公开示例检查通过"
