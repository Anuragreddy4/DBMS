const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pythonCandidates = process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"];
const buildScripts = ["bot_knowledge.py", "pagegen.py", "lesson_pagegen.py", "homegen.py"];

function runPython(script) {
  let lastError;
  for (const command of pythonCandidates) {
    const args = command === "py" ? [path.join("src", script)] : [path.join("src", script)];
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
    if (!result.error && result.status === 0) return;
    lastError = result.error || new Error(`${command} ${script} exited with status ${result.status}`);
    if (result.error && result.error.code === "ENOENT") continue;
    throw lastError;
  }
  throw lastError || new Error("Python 3 is required to build the existing static pages.");
}

function copyTree(source, target) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, target, { recursive: true, force: true, filter: (entry) => !entry.includes("__pycache__") });
}

for (const script of buildScripts) runPython(script);

const output = path.join(root, "public");
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of ["index.html"]) fs.copyFileSync(path.join(root, file), path.join(output, file));
for (const folder of ["assets", "units", "lessons", "knowledge"]) copyTree(path.join(root, folder), path.join(output, folder));
console.log("Built static deployment in public/ (site assets and generated knowledge only).");
