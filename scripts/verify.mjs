import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runBiome(args) {
  return spawnSync("biome", args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

function runNode(args) {
  return spawnSync("node", args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

const valid = runBiome(["lint", "fixtures/valid"]);

if (valid.status !== 0) {
  process.stdout.write(valid.stdout);
  process.stderr.write(valid.stderr);
  throw new Error("Expected valid fixtures to pass.");
}

const invalid = runBiome(["lint", "--reporter=json", "fixtures/invalid"]);

if (invalid.status === 0) {
  process.stdout.write(invalid.stdout);
  process.stderr.write(invalid.stderr);
  throw new Error("Expected invalid fixtures to fail.");
}

const invalidOutput = `${invalid.stdout}\n${invalid.stderr}`;

if (!invalidOutput.includes("Google Translate DOM-mutation hazards")) {
  process.stdout.write(invalid.stdout);
  process.stderr.write(invalid.stderr);
  throw new Error("Expected invalid fixtures to report the plugin diagnostic.");
}

const jsonStart = invalidOutput.indexOf("{");
const jsonEnd = invalidOutput.lastIndexOf("}");
const result = JSON.parse(invalidOutput.slice(jsonStart, jsonEnd + 1));
const pluginDiagnostics = result.diagnostics.filter(
  (diagnostic) => diagnostic.category === "plugin",
);
const pluginLocations = new Set();

for (const diagnostic of pluginDiagnostics) {
  const { location } = diagnostic;
  const key = [
    location.path,
    location.start.line,
    location.start.column,
    location.end.line,
    location.end.column,
  ].join(":");

  if (pluginLocations.has(key)) {
    process.stdout.write(invalid.stdout);
    process.stderr.write(invalid.stderr);
    throw new Error(`Expected plugin diagnostics to be unique, found ${key}.`);
  }

  pluginLocations.add(key);
}

if (pluginDiagnostics.length !== 15) {
  process.stdout.write(invalid.stdout);
  process.stderr.write(invalid.stderr);
  throw new Error(
    `Expected 15 plugin diagnostics, found ${pluginDiagnostics.length}.`,
  );
}

const fixTmpDir = mkdtempSync(join(tmpdir(), "react-google-translate-fix-"));
const fixFixtureDir = join(fixTmpDir, "invalid");

cpSync("fixtures/invalid", fixFixtureDir, { recursive: true });

try {
  const fix = runNode([
    "bin/cli.mjs",
    "fix",
    `${fixFixtureDir}/**/*.{jsx,tsx}`,
    "--write",
  ]);

  if (fix.status !== 0) {
    process.stdout.write(fix.stdout);
    process.stderr.write(fix.stderr);
    throw new Error("Expected autofix command to complete successfully.");
  }

  const fixed = runBiome([
    "lint",
    "--config-path",
    "biome.json",
    "--reporter=json",
    fixFixtureDir,
  ]);
  const fixedOutput = `${fixed.stdout}\n${fixed.stderr}`;
  const fixedJsonStart = fixedOutput.indexOf("{");
  const fixedJsonEnd = fixedOutput.lastIndexOf("}");
  const fixedResult = JSON.parse(
    fixedOutput.slice(fixedJsonStart, fixedJsonEnd + 1),
  );
  const remainingPluginDiagnostics = fixedResult.diagnostics.filter(
    (diagnostic) => diagnostic.category === "plugin",
  );

  if (remainingPluginDiagnostics.length !== 0) {
    process.stdout.write(fixed.stdout);
    process.stderr.write(fixed.stderr);
    throw new Error(
      `Expected autofixed fixtures to have 0 plugin diagnostics, found ${remainingPluginDiagnostics.length}.`,
    );
  }
} finally {
  rmSync(fixTmpDir, { recursive: true, force: true });
}

console.log("Fixture verification passed.");
