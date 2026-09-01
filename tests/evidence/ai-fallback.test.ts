import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs"; import { resolve } from "node:path";
import { applyExtractionFailsafe, extractLiveSemanticCandidate, findSemanticCandidates, replaySemanticResponse, failsafe } from "../../src/evidence/ai-fallback.js";
import { buildGraphFromEvidence } from "../../src/graph/builder.js";
import { buildBaselineGraph } from "../../fixtures/baseline.js";
import { computeGraphDelta } from "../../src/graph/diff.js";
import { evaluatePolicySync } from "../../src/policy/evaluator.js";
const source = (n: string) => resolve("fixtures/source", n); const json = (n: string) => JSON.parse(readFileSync(resolve("fixtures/extractor", n), "utf8"));
describe("AI semantic fallback", () => {
  it("replays routePayment as uncertain AI evidence on the normal graph-policy REVIEW path", () => { const c = findSemanticCandidates(source("ambiguous-route.ts"), "c"); const out = replaySemanticResponse(c[0]!, json("ambiguous-route-payment.json")); expect(out.atoms[0]).toMatchObject({ derivation: "AI_INFERRED", confidence: "UNCERTAIN" }); const graph = buildGraphFromEvidence(out.atoms, "c"); expect(evaluatePolicySync({ delta: computeGraphDelta(buildBaselineGraph(), graph), proposedGraph: graph, approvedPartners: { version: "t", updatedAt: "now", partners: [] }, policyVersion: "t" }).decision).toBe("REVIEW"); });
  it("surfaces the decoy but recorded replay emits no evidence", () => { const c = findSemanticCandidates(source("non-adapter.ts"), "c"); expect(c).toHaveLength(1); expect(replaySemanticResponse(c[0]!, json("non-adapter.json"))).toEqual({ atoms: [] }); });
  it("schema-invalid replay and extractor failure force the same REVIEW failsafe", () => { expect(replaySemanticResponse(findSemanticCandidates(source("ambiguous-route.ts"), "c")[0]!, { nope: true }).failsafe?.policyId).toBe("EXTRACTION_FAILSAFE"); expect(failsafe("timeout").failsafe?.severity).toBe("REVIEW"); });
  it("overrides an otherwise PASS result with the frozen-shape failsafe violation", () => { const result = applyExtractionFailsafe({ decision: "PASS", violations: [], policyVersion: "t", evaluatedAt: "now" }, failsafe("timeout")); expect(result).toMatchObject({ decision: "REVIEW", violations: [expect.objectContaining({ policyId: "EXTRACTION_FAILSAFE" })] }); });

  it("gives extraction failsafe precedence over a generic topology review", () => {
    const result = applyExtractionFailsafe(
      {
        decision: "REVIEW",
        violations: [{ policyId: "TOPOLOGY-CHANGE", severity: "REVIEW", message: "generic", graphObjects: [], evidenceIds: [] }],
        policyVersion: "t",
        evaluatedAt: "now",
      },
      failsafe("timeout"),
    );
    expect(result.violations.map((violation) => violation.policyId)).toEqual(["EXTRACTION_FAILSAFE"]);
  });
  it("converts missing-key client construction into REVIEW failsafe", async () => { const original = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY; try { const outcome = await extractLiveSemanticCandidate(findSemanticCandidates(source("ambiguous-route.ts"), "c")[0]!); expect(outcome.failsafe?.policyId).toBe("EXTRACTION_FAILSAFE"); } finally { if (original !== undefined) process.env.GEMINI_API_KEY = original; } });
});
