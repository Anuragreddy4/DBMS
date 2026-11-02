const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const candidates = process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"];
const forwardedArgs = process.argv.slice(2);
let lastError;

for (const command of candidates) {
  const result = spawnSync(command, ["src/build_dbms_index.py", ...forwardedArgs], { cwd: root, stdio: "inherit", shell: false });
  if (!result.error && result.status === 0) process.exit(0);
  lastError = result.error || new Error(`${command} exited with status ${result.status}`);
  if (result.error?.code === "ENOENT") continue;
  process.exit(result.status || 1);
}

console.error(lastError?.message || "Python 3 is required to build the DBMS source index.");
process.exit(1);
