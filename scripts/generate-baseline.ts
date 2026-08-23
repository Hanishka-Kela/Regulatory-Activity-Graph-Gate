/**
 * Script to generate the approved-baseline.json artifact.
 * Run: node --input-type=module < scripts/generate-baseline.js
 * Or: npx tsx scripts/generate-baseline.ts
 *
 * This is a one-time generation script. The output is committed to
 * .regulatory/approved-baseline.json as a pinned, versioned artifact.
 * Never auto-regenerate this file at runtime.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamically import to avoid top-level await issues
const { buildBaselineGraph } = await import("../fixtures/baseline.js");

const graph = buildBaselineGraph();

const baseline = {
  schemaVersion: "2",
  comment: "Pinned approved baseline artifact. Do NOT regenerate at runtime. Update requires explicit approval action.",
  canonicalGraph: graph,
  graphHash: graph.hash,
  sourceCommit: "baseline-commit-001",
  approvedAt: "2026-08-23T00:00:00Z",
  approvedBy: "compliance-team@razorpay.com",
};

const outPath = join(__dirname, "../.regulatory/approved-baseline.json");
writeFileSync(outPath, JSON.stringify(baseline, null, 2), "utf8");
console.log("Generated:", outPath);
console.log("Hash:", graph.hash);
