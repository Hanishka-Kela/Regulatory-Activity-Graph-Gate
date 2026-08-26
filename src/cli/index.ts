import { Command } from "commander";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { extractEvidenceFromFile } from "../evidence/extractor.js";
import { applyExtractionFailsafe, extractLiveSemanticCandidate, findSemanticCandidates } from "../evidence/ai-fallback.js";
import { buildGraphFromEvidence } from "../graph/builder.js";
import { computeGraphDelta } from "../graph/diff.js";
import { evaluatePolicySync } from "../policy/evaluator.js";
import type { ActivityGraph } from "../graph/types.js";
import type { ApprovedPartnerRegistry } from "../policy/types.js";

function files(path: string): string[] { if (!statSync(path).isDirectory()) return path.endsWith(".ts") ? [path] : []; return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? (["node_modules", ".git", "dist"].includes(entry.name) ? [] : files(join(path, entry.name))) : entry.name.endsWith(".ts") ? [join(path, entry.name)] : []); }
function display(decision: string) { return decision === "REVIEW" ? "REVIEW_REQUIRED" : decision; }
export async function evaluate(baselinePath: string, sourcePath: string) {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")).canonicalGraph as ActivityGraph;
  const registry = JSON.parse(readFileSync(resolve(".regulatory/approved-partners.json"), "utf8")) as ApprovedPartnerRegistry;
  const commitSha = "local-evaluation";
  const sourceFiles = files(sourcePath);
  const deterministicEvidence = sourceFiles.flatMap((file) => extractEvidenceFromFile(file, { commitSha }));
  const outcomes = await Promise.all(sourceFiles.flatMap((file) => findSemanticCandidates(file, commitSha)).map((candidate) => extractLiveSemanticCandidate(candidate)));
  const evidence = [...deterministicEvidence, ...outcomes.flatMap((outcome) => outcome.atoms)];
  const proposedGraph = buildGraphFromEvidence(evidence, commitSha, "CLI proposed graph");
  const result = evaluatePolicySync({ delta: computeGraphDelta(baseline, proposedGraph), proposedGraph, approvedPartners: registry, policyVersion: "1" });
  return outcomes.reduce((current, outcome) => applyExtractionFailsafe(current, outcome), result);
}
const program = new Command();
program.name("regulatory-gate").command("evaluate").requiredOption("--baseline <path>").requiredOption("--source <path>").option("--json").action(async (options) => {
  const result = await evaluate(resolve(options.baseline), resolve(options.source));
  if (options.json) console.log(JSON.stringify(result)); else console.log(display(result.decision));
  process.exitCode = result.decision === "PASS" ? 0 : result.decision === "BLOCK" ? 1 : 2;
});
program.parse();
