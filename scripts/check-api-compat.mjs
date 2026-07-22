#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";

function usage() {
  console.error("用法：node scripts/check-api-compat.mjs --current <API JSON> --baseline <版本=API JSON>... [--report <报告 JSON>]");
  process.exit(2);
}

const options = { current: "", report: "", baselines: [] };
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--current") {
    options.current = process.argv[index + 1] ?? "";
    index += 1;
    continue;
  }
  if (argument === "--report") {
    options.report = process.argv[index + 1] ?? "";
    index += 1;
    continue;
  }
  if (argument === "--baseline") {
    const value = process.argv[index + 1] ?? "";
    const separator = value.indexOf("=");
    if (separator < 1 || separator === value.length - 1) usage();
    options.baselines.push({
      version: value.slice(0, separator),
      path: value.slice(separator + 1),
    });
    index += 1;
    continue;
  }
  usage();
}

if (!options.current || options.baselines.length === 0) usage();

function loadApi(file) {
  const raw = fs.readFileSync(file);
  const value = JSON.parse(raw.toString("utf8"));
  if (!value || !Array.isArray(value.declarations)) {
    throw new Error(`${file} 不是有效的 API JSON`);
  }
  return {
    raw,
    value,
    sha256: crypto.createHash("sha256").update(raw).digest("hex"),
  };
}

function uniqueMap(items, keyOf, context, errors) {
  const result = new Map();
  for (const item of items ?? []) {
    const key = keyOf(item);
    if (result.has(key)) {
      errors.push(`${context} 出现重复成员：${key}`);
    } else {
      result.set(key, item);
    }
  }
  return result;
}

function resultCompatible(previous, current) {
  if (previous === current || previous === "任意") return true;
  const previousParts = new Set(String(previous).split("|"));
  const currentParts = String(current).split("|");
  return currentParts.every((part) => previousParts.has(part));
}

function compareParameters(previous, current) {
  if ((previous ?? []).length !== (current ?? []).length) return false;
  return previous.every((parameter, index) => {
    const candidate = current[index];
    return parameter.name === candidate.name && parameter.type === candidate.type;
  });
}

function compareCallable(previous, current, context, errors) {
  if (previous.static !== current.static) errors.push(`${context} 的静态属性已改变`);
  if (previous.async !== current.async) errors.push(`${context} 的异步属性已改变`);
  if (!compareParameters(previous.parameters ?? [], current.parameters ?? [])) {
    errors.push(`${context} 的参数签名已改变：${previous.signature} -> ${current.signature}`);
  }
  if (!resultCompatible(previous.result, current.result)) {
    errors.push(`${context} 的返回类型不兼容：${previous.result} -> ${current.result}`);
  }
}

function declarationKey(declaration) {
  return `${declaration.kind}:${declaration.name}`;
}

function findClassMember(declarations, classDeclaration, collection, key) {
  let current = classDeclaration;
  const visited = new Set();
  while (current && !visited.has(current.name)) {
    visited.add(current.name);
    const candidate = (current[collection] ?? []).find(
      (item) => `${item.static}:${item.name}` === key,
    );
    if (candidate) return candidate;
    current = current.superclass
      ? declarations.get(`class:${current.superclass}`)
      : null;
  }
  return null;
}

function classProtocols(declarations, classDeclaration) {
  const result = new Set();
  let current = classDeclaration;
  const visited = new Set();
  while (current && !visited.has(current.name)) {
    visited.add(current.name);
    for (const protocol of current.protocols ?? []) result.add(protocol);
    current = current.superclass
      ? declarations.get(`class:${current.superclass}`)
      : null;
  }
  return result;
}

function compareApi(previousApi, currentApi, version) {
  const errors = [];
  const currentDeclarations = uniqueMap(
    currentApi.declarations,
    declarationKey,
    "当前 API",
    errors,
  );

  for (const previous of previousApi.declarations) {
    const key = declarationKey(previous);
    const current = currentDeclarations.get(key);
    const context = `${version} ${previous.kind} ${previous.name}`;
    if (!current) {
      errors.push(`${context} 已移除或改变种类`);
      continue;
    }

    if (previous.kind === "function") {
      compareCallable(previous, current, context, errors);
      continue;
    }

    if (previous.kind !== "class") {
      if (previous.type !== current.type) {
        errors.push(`${context} 的类型已改变：${previous.type} -> ${current.type}`);
      }
      continue;
    }

    if (previous.superclass !== current.superclass) {
      errors.push(`${context} 的父类已改变：${previous.superclass} -> ${current.superclass}`);
    }
    const availableProtocols = classProtocols(currentDeclarations, current);
    for (const protocol of previous.protocols ?? []) {
      if (!availableProtocols.has(protocol)) {
        errors.push(`${context} 不再实现协议 ${protocol}`);
      }
    }

    uniqueMap(
      current.fields ?? [],
      (field) => `${field.static}:${field.name}`,
      `${context} 当前域`,
      errors,
    );
    for (const field of previous.fields ?? []) {
      const fieldKey = `${field.static}:${field.name}`;
      const candidate = findClassMember(currentDeclarations, current, "fields", fieldKey);
      if (!candidate) {
        errors.push(`${context} 的域 ${field.name} 已移除或改变静态属性`);
        continue;
      }
      if (field.type !== candidate.type || field.readonly !== candidate.readonly) {
        errors.push(`${context} 的域 ${field.name} 已改变：${field.type} -> ${candidate.type}`);
      }
    }

    uniqueMap(
      current.methods ?? [],
      (method) => `${method.static}:${method.name}`,
      `${context} 当前方法`,
      errors,
    );
    for (const method of previous.methods ?? []) {
      const methodKey = `${method.static}:${method.name}`;
      const candidate = findClassMember(currentDeclarations, current, "methods", methodKey);
      if (!candidate) {
        errors.push(`${context} 的方法 ${method.name} 已移除或改变静态属性`);
        continue;
      }
      compareCallable(method, candidate, `${context}.${method.name}`, errors);
    }
  }

  return errors;
}

function statistics(api) {
  const classes = api.declarations.filter((item) => item.kind === "class");
  return {
    declarations: api.declarations.length,
    classes: classes.length,
    functions: api.declarations.filter((item) => item.kind === "function").length,
    fields: classes.reduce((total, item) => total + (item.fields?.length ?? 0), 0),
    methods: classes.reduce((total, item) => total + (item.methods?.length ?? 0), 0),
  };
}

const current = loadApi(options.current);
const report = {
  format: 1,
  current: {
    file: "api/api-v1.json",
    sha256: current.sha256,
    ...statistics(current.value),
  },
  baselines: [],
};
const allErrors = [];

for (const baselineOption of options.baselines) {
  const baseline = loadApi(baselineOption.path);
  const errors = compareApi(baseline.value, current.value, baselineOption.version);
  allErrors.push(...errors);
  report.baselines.push({
    version: baselineOption.version,
    sha256: baseline.sha256,
    compatible: errors.length === 0,
    ...statistics(baseline.value),
  });
}

if (allErrors.length > 0) {
  for (const error of allErrors) console.error(`API 不兼容：${error}`);
  process.exit(1);
}

if (options.report) {
  fs.writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`言界 API 兼容检查通过：${report.baselines.length} 个已发布基线`);
