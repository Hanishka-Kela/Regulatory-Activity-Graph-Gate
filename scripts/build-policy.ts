/**
 * Build script placeholder for compiling Rego policies to WASM.
 *
 * PREREQUISITE: OPA binary must be installed.
 *   Installation: https://www.openpolicyagent.org/docs/latest/#1-download-opa
 *   macOS: brew install opa
 *
 * USAGE: npm run build:policy
 *
 * This script compiles src/policy/rego/*.rego into a single WASM bundle
 * committed to src/policy/wasm/policy.wasm.
 *
 * WASM STALENESS WARNING: If any .rego file is edited without running this
 * script, the committed WASM artifact will be stale. The TypeScript evaluator
 * (src/policy/evaluator.ts) will still be used for `npm test`, but production
 * runtime via WASM will reflect outdated policy logic.
 *
 * Stale WASM is a real failure mode. Always run `npm run build:policy` after
 * editing .rego files and commit the updated .wasm artifact.
 */

import { execSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

// Check OPA is available
try {
  execSync("opa version", { stdio: "pipe" });
} catch {
  console.error("ERROR: OPA binary not found.");
  console.error("Install OPA: https://www.openpolicyagent.org/docs/latest/#1-download-opa");
  console.error("macOS: brew install opa");
  process.exit(1);
}

const regoDir = join(repoRoot, "src/policy/rego");
const wasmDir = join(repoRoot, "src/policy/wasm");
const wasmOut = join(wasmDir, "policy.wasm");

if (!existsSync(wasmDir)) {
  mkdirSync(wasmDir, { recursive: true });
}

console.log("Building OPA WASM from Rego policies...");
console.log("Rego dir:", regoDir);
console.log("WASM output:", wasmOut);

// OPA build command:
//   -t wasm          — target WebAssembly
//   -e regulatory/main — entrypoint package
//   The main.rego imports dl-01, pa-01, dl-02, dl-03
execSync(
  `opa build -t wasm -e regulatory/main/decision -e regulatory/main/all_violations "${regoDir}"`,
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env },
  },
);

// OPA build outputs bundle.tar.gz, extract the WASM
const bundlePath = join(repoRoot, "bundle.tar.gz");
execSync(`tar -xzf "${bundlePath}" -C "${wasmDir}" --include="*/policy.wasm" --strip-components=2`, {
  stdio: "inherit",
});

// Clean up the bundle
execSync(`rm -f "${bundlePath}"`);

console.log("✓ WASM artifact written to:", wasmOut);
console.log("  Commit this file to preserve deterministic policy evaluation.");
