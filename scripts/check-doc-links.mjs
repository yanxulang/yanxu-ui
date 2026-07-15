import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, "..");

function markdownFiles(directory) {
  const result = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const status = statSync(path);
    if (status.isDirectory() && name !== ".git" && name !== ".yanxu") {
      result.push(...markdownFiles(path));
    } else if (status.isFile() && name.endsWith(".md")) {
      result.push(path);
    }
  }
  return result;
}

const failures = [];
for (const file of markdownFiles(root)) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].trim();
    if (/^(https?:|mailto:|#)/.test(link)) continue;
    const local = decodeURIComponent(link.split("#", 1)[0]);
    if (!existsSync(resolve(dirname(file), local))) {
      failures.push(`${file.slice(root.length + 1)} -> ${link}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`以下本地文档链接无效：\n${failures.join("\n")}`);
}
console.log("言界 Markdown 本地链接检查通过");
