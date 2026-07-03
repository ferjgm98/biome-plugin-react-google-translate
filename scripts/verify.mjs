import { spawnSync } from "node:child_process";

function runBiome(args) {
  return spawnSync("biome", args, {
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

if (pluginDiagnostics.length !== 10) {
  process.stdout.write(invalid.stdout);
  process.stderr.write(invalid.stderr);
  throw new Error(
    `Expected 10 plugin diagnostics, found ${pluginDiagnostics.length}.`,
  );
}

console.log("Fixture verification passed.");
