#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`1.0 发布契约检查失败：${message}`);
  process.exit(1);
}

let root = "";
let reportPath = "";
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === "--root") {
    root = process.argv[index + 1] ?? "";
    index += 1;
  } else if (process.argv[index] === "--report") {
    reportPath = process.argv[index + 1] ?? "";
    index += 1;
  } else {
    fail(`未知参数 ${process.argv[index]}`);
  }
}
if (!root || !reportPath) fail("用法：--root <仓库> --report <报告 JSON>");
root = path.resolve(root);

function absolute(relative) {
  return path.join(root, relative);
}

function bytes(relative) {
  return fs.readFileSync(absolute(relative));
}

function text(relative) {
  return bytes(relative).toString("utf8");
}

function json(relative) {
  try {
    return JSON.parse(text(relative));
  } catch (error) {
    fail(`${relative} 不是有效 JSON：${error.message}`);
  }
}

function sha256(relative) {
  return crypto.createHash("sha256").update(bytes(relative)).digest("hex");
}

function yanxuFiles(relative) {
  return fs.readdirSync(absolute(relative)).filter((name) => name.endsWith(".yx")).sort();
}

json("api/api-v1.json");
json("api/api-v1.freeze.json");
if (!bytes("api/api-v1.json").equals(bytes("api/api-v1.freeze.json"))) {
  fail("当前 API 与 1.0 冻结快照不一致");
}

const compatibility = json("api/compatibility-v1.json");
const requiredBaselines = [
  "0.1.0", "0.1.1", "0.1.2", "0.2.0", "0.3.0", "0.4.0",
  "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0",
];
if (compatibility.format !== 1 || compatibility.current?.sha256 !== sha256("api/api-v1.json")) {
  fail("兼容报告的当前 API 摘要不一致");
}
if (JSON.stringify(compatibility.baselines?.map((item) => item.version)) !== JSON.stringify(requiredBaselines)) {
  fail("兼容报告必须覆盖 0.1.0–0.9.0 的十一个已发布基线");
}
if (compatibility.baselines.some((item) => item.compatible !== true)) {
  fail("兼容报告包含未通过基线");
}

const supply = json("api/supply-chain-v1.json");
const platform = supply.directDependencies?.find((item) => item.name === "yanxu-platform");
const data = supply.directDependencies?.find((item) => item.name === "言据");
if (supply.format !== 1 || supply.package !== "yanxu-ui" || supply.lock?.generator !== "1.1.9") {
  fail("供应链报告格式、包名或最低锁生成器不一致");
}
if (platform?.version !== "1.0.0" || platform.revision !== "9b6bce794a2e23fba04340f762e3d8f49a2724ff" || platform.nativeAbi !== 2) {
  fail("言台 1.0.0 来源或 ABI 不一致");
}
if (data?.version !== "1.1.2" || data.revision !== "765d9dd623db901a3e71aa4759dbcd77563cb3a9") {
  fail("言据 1.1.2 来源不一致");
}
if (supply.ownedNativeLibraries?.length !== 0 ||
    JSON.stringify(supply.sourcePackageImports) !== JSON.stringify(["言据", "言台"])) {
  fail("言界必须保持纯言序边界且只导入已审核包");
}
if (supply.githubActions?.some((item) => !/@[0-9a-f]{40}$/.test(item))) {
  fail("工作流动作必须固定到 40 位提交");
}

const tests = yanxuFiles("tests");
const examples = yanxuFiles("examples");
const integrations = yanxuFiles("integration");
const headlessIntegrations = [
  "控件树集成.yx", "表单控件.yx", "渲染命令.yx", "高级控件.yx", "数据视图.yx",
  "文本视图.yx", "生命周期.yx", "生命周期压力.yx", "滚动无障碍.yx",
  "无障碍全控件.yx", "交互长序列.yx",
];
const windowIntegrations = [
  "真实窗口.yx", "叠层窗口.yx", "菜单窗口.yx", "动画窗口.yx", "生产后端窗口.yx",
];
if (tests.length !== 14) fail(`单元测试卷应为 14，当前为 ${tests.length}`);
if (examples.length !== 15) fail(`公开示例应为 15，当前为 ${examples.length}`);
const expectedIntegrations = [...headlessIntegrations, ...windowIntegrations].sort();
if (JSON.stringify(integrations) !== JSON.stringify(expectedIntegrations)) {
  fail("集成测试清单不等于 11 条无窗口路径与 5 条真实窗口路径");
}

const manifest = text("言序.toml");
if (!/^言序 = ">=1\.1\.9"$/m.test(manifest) ||
    !/^言台 = .*修订 = "v1\.0\.0".*版 = "\^1\.0"/m.test(manifest) ||
    !/^言据 = .*修订 = "765d9dd623db901a3e71aa4759dbcd77563cb3a9".*版 = "\^1\.1"/m.test(manifest)) {
  fail("清单工具链或依赖约束不一致");
}

const workflow = text(".github/workflows/ci.yml");
for (const marker of [
  "ref: v1.1.9", "ref: v1.1.20", "发布候选演练", "YANXU_MAX_STEPS=100000000",
  "x86_64-unknown-linux-gnu", "aarch64-unknown-linux-gnu", "x86_64-apple-darwin",
  "aarch64-apple-darwin", "x86_64-pc-windows-msvc", "aarch64-pc-windows-msvc",
]) {
  if (!workflow.includes(marker)) fail(`CI 缺少门禁标记：${marker}`);
}

const requiredDocs = [
  "README.md", "COMPATIBILITY.md", "SUPPORT.md", "SECURITY.md", "THIRD_PARTY.md",
  "docs/API.md", "docs/REFERENCE.md", "docs/COMPATIBILITY_PROOF.md",
  "docs/MIGRATION_0_X_TO_1_0.md", "docs/PRODUCTION_VALIDATION.md", "docs/PACKAGING.md",
];
for (const file of requiredDocs) {
  if (!fs.existsSync(absolute(file)) || !fs.statSync(absolute(file)).isFile()) {
    fail(`缺少稳定文档 ${file}`);
  }
}
for (const marker of ["1.0 公开承诺", "工具链与依赖", "发布与修复", "支持边界"]) {
  if (!text("SUPPORT.md").includes(marker)) fail(`SUPPORT.md 缺少 ${marker}`);
}

const targets = [
  "x86_64-unknown-linux-gnu", "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin", "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc", "aarch64-pc-windows-msvc",
];
const report = {
  format: 1,
  contract: "yanxu-ui-1.0",
  publicApi: {
    sha256: sha256("api/api-v1.json"),
    declarations: compatibility.current.declarations,
    classes: compatibility.current.classes,
    functions: compatibility.current.functions,
    fields: compatibility.current.fields,
    methods: compatibility.current.methods,
  },
  compatibility: {
    reportSha256: sha256("api/compatibility-v1.json"),
    baselines: requiredBaselines,
    allCompatible: true,
  },
  supplyChain: {
    reportSha256: sha256("api/supply-chain-v1.json"),
    platform: { version: platform.version, revision: platform.revision, nativeAbi: platform.nativeAbi },
    data: { version: data.version, revision: data.revision },
    ownedNativeLibraries: 0,
  },
  protocols: {
    platform: "1.7",
    event: "1.3",
    accessibility: "1.0",
    drawing: "1.1",
  },
  toolchains: { minimum: "1.1.9", release: "1.1.20" },
  targets,
  gates: {
    unitSuites: tests.length,
    headlessIntegrations: headlessIntegrations.length,
    realWindowIntegrations: windowIntegrations.length,
    publicExamples: examples.length,
    releaseYxbPerTarget: examples.length + 1,
    interactionRounds: 4096,
    resourceConvergenceRounds: 1024,
  },
  releaseAssets: [
    "yanxu-ui-{version}-six-targets.tar.gz",
    "yanxu-ui-{version}-six-targets.sha256",
    "yanxu-ui-{version}.toml",
    "api-v1.json",
  ],
  supportPolicySha256: sha256("SUPPORT.md"),
  licenses: supply.licenses,
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log("言界 1.0 发布契约检查通过");
