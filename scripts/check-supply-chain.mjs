#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.error("用法：node scripts/check-supply-chain.mjs --root <仓库> --report <报告 JSON>");
  process.exit(2);
}

let root = "";
let reportPath = "";
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === "--root") {
    root = process.argv[index + 1] ?? "";
    index += 1;
    continue;
  }
  if (process.argv[index] === "--report") {
    reportPath = process.argv[index + 1] ?? "";
    index += 1;
    continue;
  }
  usage();
}
if (!root || !reportPath) usage();
root = path.resolve(root);

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function sha256(relative) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, relative)))
    .digest("hex");
}

function fail(message) {
  console.error(`供应链检查失败：${message}`);
  process.exit(1);
}

function parseInlineDependency(manifest, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = manifest.match(new RegExp(`^${escaped}\\s*=\\s*\\{([^\\n]+)\\}$`, "m"));
  if (!line) fail(`清单缺少依赖 ${name}`);
  const fields = {};
  for (const match of line[1].matchAll(/([^,\s]+)\s*=\s*"([^"]+)"/g)) {
    fields[match[1]] = match[2];
  }
  for (const field of ["包", "git", "修订", "版"]) {
    if (!fields[field]) fail(`依赖 ${name} 缺少 ${field}`);
  }
  return fields;
}

function parsePackageBlock(block) {
  function value(name) {
    return block.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"$`, "m"))?.[1] ?? "";
  }
  const name = value("name");
  if (!name) fail("锁文件包含无名称包");
  const result = {
    name,
    version: value("version"),
    source: value("source"),
    revision: value("revision"),
    checksum: value("checksum"),
  };
  const abi = block.match(/^abi\s*=\s*(\d+)$/m)?.[1];
  if (abi) result.nativeAbi = Number(abi);
  return result;
}

function walk(directory, visitor) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", ".yanxu", "target", "node_modules"].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, visitor);
    else if (entry.isFile()) visitor(fullPath);
  }
}

const manifest = read("言序.toml");
const lock = read("言序.lock");
const platformManifest = parseInlineDependency(manifest, "言台");
const dataManifest = parseInlineDependency(manifest, "言据");

if (platformManifest.包 !== "yanxu-platform" || platformManifest.修订 !== "v1.0.0" || platformManifest.版 !== "^1.0") {
  fail("言台必须固定 v1.0.0 与 ^1.0");
}
if (dataManifest.包 !== "言据" || dataManifest.修订 !== "765d9dd623db901a3e71aa4759dbcd77563cb3a9" || dataManifest.版 !== "^1.1") {
  fail("言据必须固定已审核的 1.1.2 修订与 ^1.1");
}

const target = lock.match(/^target\s*=\s*"([^"]+)"$/m)?.[1] ?? "";
const generator = lock.match(/^generator\s*=\s*"([^"]+)"$/m)?.[1] ?? "";
if (!target) fail("锁文件缺少目标");
if (generator !== "1.1.9") fail(`公开锁必须由最低工具链 1.1.9 生成，当前为 ${generator}`);

const packages = lock
  .split(/\n\[\[package\]\]\n/)
  .slice(1)
  .map(parsePackageBlock)
  .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
if (packages.length !== 2 || packages.map((item) => item.name).sort().join(",") !== "yanxu-platform,言据") {
  fail("锁文件必须且只能包含言台与言据两个直接包");
}

for (const item of packages) {
  if (!/^[0-9a-f]{40}$/.test(item.revision)) fail(`${item.name} 修订不是 40 位提交`);
  if (!/^[0-9a-f]{64}$/.test(item.checksum)) fail(`${item.name} 摘要不是 SHA-256`);
}
const platformLock = packages.find((item) => item.name === "yanxu-platform");
const dataLock = packages.find((item) => item.name === "言据");
if (platformLock.version !== "1.0.0" || platformLock.revision !== "9b6bce794a2e23fba04340f762e3d8f49a2724ff" || platformLock.nativeAbi !== 2) {
  fail("言台锁必须指向已发布的 1.0.0 提交和 ABI v2");
}
if (dataLock.version !== "1.1.2" || dataLock.revision !== dataManifest.修订) {
  fail("言据锁与清单修订不一致");
}

const imports = new Set();
walk(path.join(root, "src"), (file) => {
  if (!file.endsWith(".yx")) return;
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/引「包:([^/」]+)(?:\/[^」]*)?」/g)) imports.add(match[1]);
});
const sortedImports = [...imports].sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
if (sortedImports.length !== 2 || !imports.has("言台") || !imports.has("言据")) {
  fail(`源码包导入超出审核范围：${sortedImports.join("、")}`);
}

const nativeLibraries = [];
walk(root, (file) => {
  if ([".dll", ".dylib", ".so"].includes(path.extname(file))) {
    nativeLibraries.push(path.relative(root, file));
  }
});
if (nativeLibraries.length > 0) fail(`仓库携带自有原生库：${nativeLibraries.join("、")}`);

const actionUses = new Set();
for (const workflow of fs.readdirSync(path.join(root, ".github", "workflows"))) {
  if (!/\.ya?ml$/.test(workflow)) continue;
  const content = read(path.join(".github", "workflows", workflow));
  for (const match of content.matchAll(/uses:\s*([^\s#]+)/g)) actionUses.add(match[1]);
}
const actions = [...actionUses].sort();
for (const action of actions) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/.test(action)) {
    fail(`GitHub Action 未固定 40 位提交：${action}`);
  }
}

const thirdParty = read("THIRD_PARTY.md");
for (const expected of ["yanxu-platform", "1.0.0", "MIT OR Apache-2.0", "言据", "1.1.2", "MIT"]) {
  if (!thirdParty.includes(expected)) fail(`THIRD_PARTY.md 缺少 ${expected}`);
}

const report = {
  format: 1,
  package: "yanxu-ui",
  directDependencies: packages,
  manifestDependencies: [
    { name: "yanxu-platform", ...platformManifest },
    { name: "言据", ...dataManifest },
  ],
  lock: { target, generator, sha256: sha256("言序.lock") },
  sourcePackageImports: sortedImports,
  licenses: [
    { identifier: "Apache-2.0", file: "LICENSE-APACHE", sha256: sha256("LICENSE-APACHE") },
    { identifier: "MIT", file: "LICENSE-MIT", sha256: sha256("LICENSE-MIT") },
  ],
  githubActions: actions,
  ownedNativeLibraries: nativeLibraries,
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log("言界依赖、许可、工作流与原生边界检查通过");
