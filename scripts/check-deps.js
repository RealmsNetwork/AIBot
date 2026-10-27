const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packagePath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
let failed = false;

for (const file of ["package.json", "src/index.js", "src/ai.js", "src/commands.js", ".gitignore", ".env.example", "config.json"]) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`[missing] Required project file: ${file}`);
    failed = true;
  }
}

if (!fs.existsSync(lockPath)) {
  console.warn("[warn] package-lock.json is missing. Run npm install and commit the lockfile for reproducible deployments.");
} else {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    if (lock.name !== pkg.name || lock.version !== pkg.version) {
      console.error("[error] package-lock.json name/version does not match package.json.");
      failed = true;
    }
    for (const [name, version] of Object.entries(pkg.dependencies || {})) {
      const locked = lock.packages?.[`node_modules/${name}`]?.version;
      if (!locked) {
        console.error(`[error] Dependency missing from lockfile: ${name} (${version})`);
        failed = true;
      }
    }
  } catch (error) {
    console.error("[error] Could not parse package-lock.json:", error.message);
    failed = true;
  }
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["ls", "--depth=0", "--json"], { cwd: root, encoding: "utf8" });
if (result.status !== 0) {
  console.error("[error] npm reports missing or invalid installed dependencies.");
  if (result.stdout) {
    try {
      const tree = JSON.parse(result.stdout);
      for (const [name, info] of Object.entries(tree.problems ? tree.dependencies || {} : {})) {
        if (info?.missing || info?.invalid || info?.problems) console.error(`  - ${name}: ${info.problems || (info.missing ? "missing" : "invalid")}`);
      }
      for (const problem of tree.problems || []) console.error(`  - ${problem}`);
    } catch {}
  }
  console.error("Run npm ci (with a committed lockfile) or npm install to repair the dependency tree.");
  failed = true;
}

if (failed) process.exit(1);
console.log("[ok] Required files and dependency tree look consistent.");
