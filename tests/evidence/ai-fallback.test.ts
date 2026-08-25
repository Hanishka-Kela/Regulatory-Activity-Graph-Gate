import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs"; import { resolve } from "node:path";
import { findSemanticCandidates, replaySemanticResponse, failsafe } from "../../src/evidence/ai-fallback.js";
const source = (n: string) => resolve("fixtures/source", n); const json = (n: string) => JSON.parse(readFileSync(resolve("fixtures/extractor", n), "utf8"));
describe("AI semantic fallback", () => {
  it("replays routePayment as uncertain AI evidence", () => { const c = findSemanticCandidates(source("ambiguous-route.ts"), "c"); const out = replaySemanticResponse(c[0]!, json("ambiguous-route-payment.json")); expect(out.atoms[0]).toMatchObject({ derivation: "AI_INFERRED", confidence: "UNCERTAIN" }); });
  it("surfaces the decoy but recorded replay emits no evidence", () => { const c = findSemanticCandidates(source("non-adapter.ts"), "c"); expect(c).toHaveLength(1); expect(replaySemanticResponse(c[0]!, json("non-adapter.json"))).toEqual({ atoms: [] }); });
  it("schema-invalid replay and extractor failure force the same REVIEW failsafe", () => { expect(replaySemanticResponse(findSemanticCandidates(source("ambiguous-route.ts"), "c")[0]!, { nope: true }).failsafe?.policyId).toBe("EXTRACTION_FAILSAFE"); expect(failsafe("timeout").failsafe?.severity).toBe("REVIEW"); });
});
