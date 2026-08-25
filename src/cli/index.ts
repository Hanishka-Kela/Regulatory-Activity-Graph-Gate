import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command } from "commander";
import { extractEvidenceFromFile } from "../evidence/extractor.js";
import { buildGraphFromEvidence } from "../graph/builder.js";
import { verifyGraphHash } from "../graph/canonical.js";
import { computeGraphDelta } from "../graph/diff.js";
import { evaluatePolicySync } from "../policy/evaluator.js";
import type { ActivityGraph } from "../graph/types.js";
import type { ApprovedPartnerRegistry, PolicyResult } from "../policy/types.js";

type BaselineArtifact = { canonicalGraph: ActivityGraph; graphHash: string };
export function evaluateSource(baselinePath: string, sourcePath: string): PolicyResult {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as BaselineArtifact;
  if (baseline.graphHash !== baseline.canonicalGraph.hash || !verifyGraphHash(baseline.canonicalGraph)) throw new Error("Approved baseline hash is invalid");
  const files = sourceFiles(sourcePath);
  const evidence = files.flatMap((file) => extractEvidenceFromFile(file, { commitSha: "evaluated-working-tree" }));
  const proposedGraph = buildGraphFromEvidence(evidence, "evaluated-working-tree", "CLI proposed graph");
  const partners = JSON.parse(readFileSync(resolve(".regulatory/approved-partners.json"), "utf8")) as ApprovedPartnerRegistry;
  return evaluatePolicySync({ delta: computeGraphDelta(baseline.canonicalGraph, proposedGraph), proposedGraph, approvedPartners: partners, policyVersion: "1" });
}
function sourceFiles(path: string): string[] {
  const absolute = resolve(path); const entries = readdirSync(absolute, { withFileTypes: true });
  return entries.flatMap((entry) => entry.isDirectory() ? sourceFiles(join(absolute, entry.name)) : entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [join(absolute, entry.name)] : []);
}
const program = new Command();
program.command("evaluate").requiredOption("--baseline <path>").requiredOption("--source <path>").option("--json").action((options) => {
  const result = evaluateSource(options.baseline, options.source);
  const display = result.decision === "REVIEW" ? "REVIEW_REQUIRED" : result.decision;
  if (options.json) process.stdout.write(`${JSON.stringify({ ...result, displayDecision: display })}\n`); else process.stdout.write(`${display}\n`);
  process.exitCode = result.decision === "PASS" ? 0 : result.decision === "BLOCK" ? 1 : 2;
});
program.parse();
