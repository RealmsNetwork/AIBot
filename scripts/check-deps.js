const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
let failed = false;

for (const file of ["package.json", "src/index.js", "src/manager.js", "src/ai.js", ".gitignore", ".env.example", "config.json", "README.md"]) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`[missing] Required project file: ${file}`);
    failed = true;
  }
}

const lockPath = path.join(root, "package-lock.json");
if (!fs.existsSync(lockPath)) {
  console.warn("[warn] package-lock.json is missing. Run npm install and commit the generated lockfile for reproducible deployments.");
} else {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    if (lock.name !== pkg.name || lock.version !== pkg.version) {
      console.error("[error] package-lock.json name/version does not match package.json.");
      failed = true;
    }
    for (const name of Object.keys(pkg.dependencies || {})) {
      if (!lock.packages?.[`node_modules/${name}`]) {
        console.error(`[error] Dependency missing from lockfile: ${name}`);
        failed = true;
      }
    }
  } catch (error) {
    console.error("[error] Could not parse package-lock.json:", error.message);
    failed = true;
  }
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const installed = spawnSync(npm, ["ls", "--depth=0", "--json"], { cwd: root, encoding: "utf8" });
if (installed.status !== 0) {
  console.error("[error] npm reports missing or invalid installed dependencies.");
  if (installed.stdout) {
    try {
      const tree = JSON.parse(installed.stdout);
      for (const problem of tree.problems || []) console.error(`  - ${problem}`);
    } catch {}
  }
  console.error("Run npm install to repair the dependency tree.");
  failed = true;
} else {
  console.log("[ok] Installed top-level dependencies are present.");
}

const outdated = spawnSync(npm, ["outdated", "--json"], { cwd: root, encoding: "utf8", timeout: 30000 });
if (outdated.stdout) {
  try {
    const report = JSON.parse(outdated.stdout);
    const entries = Object.entries(report);
    if (entries.length) {
      console.warn("[update] Dependency updates are available:");
      for (const [name, versions] of entries) console.warn(`  - ${name}: installed ${versions.current}, wanted ${versions.wanted}, latest ${versions.latest}`);
    } else {
      console.log("[ok] No outdated dependencies reported.");
    }
  } catch {
    if (outdated.error) console.warn(`[warn] Could not check registry for outdated packages: ${outdated.error.message}`);
  }
} else if (outdated.error) {
  console.warn(`[warn] Could not check registry for outdated packages: ${outdated.error.message}`);
}

if (failed) process.exit(1);
console.log("[ok] Required files and dependency tree look consistent.");
