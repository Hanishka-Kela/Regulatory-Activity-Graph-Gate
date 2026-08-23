import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { evaluatePolicySync } from "../../src/policy/evaluator.js";
import type { ApprovedPartnerRegistry, PolicyInput } from "../../src/policy/types.js";
import { baselineGraph } from "../../fixtures/baseline.js";
import { passGraph } from "../../fixtures/case-pass.js";
import { reviewGraph } from "../../fixtures/case-review.js";
import { blockGraph } from "../../fixtures/case-block.js";
import { ambiguousGraph } from "../../fixtures/case-ambiguous.js";
import { computeGraphDelta } from "../../src/graph/diff.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const mainRego = readFileSync(join(repoRoot, "src/policy/rego/main.rego"), "utf8");

const approvedRegistry: ApprovedPartnerRegistry = {
  version: "1.0.0",
  updatedAt: "2026-08-23T00:00:00Z",
  partners: [{
    actorId: "actor:partner_x",
    name: "Partner X NBFC",
    roles: ["LENDING_SERVICE_PROVIDER", "NBFC"],
    approvedAt: "2026-01-15T00:00:00Z",
    approvedBy: "compliance-team@razorpay.com",
  }],
};

const fixtures = [
  ["baseline", baselineGraph, "PASS"],
  ["pass", passGraph, "PASS"],
  ["review", reviewGraph, "REVIEW"],
  ["block", blockGraph, "BLOCK"],
  ["ambiguous", ambiguousGraph, "REVIEW"],
] as const;

describe("Rego aggregate parity contract", () => {
  it("main.rego imports and aggregates all four policies", () => {
    expect(mainRego).toContain("import data.regulatory.dl01");
    expect(mainRego).toContain("import data.regulatory.pa01");
    expect(mainRego).toContain("import data.regulatory.dl02");
    expect(mainRego).toContain("import data.regulatory.dl03");
    expect(mainRego).toContain("v := dl01.violations[_]");
    expect(mainRego).toContain("v := pa01.violations[_]");
    expect(mainRego).toContain("v := dl02.violations[_]");
    expect(mainRego).toContain("v := dl03.violations[_]");
  });

  it.each(fixtures)("TypeScript decision for %s matches the hand-verified Rego decision", (_name, graph, expected) => {
    const input: PolicyInput = {
      delta: computeGraphDelta(baselineGraph, graph),
      proposedGraph: graph,
      approvedPartners: approvedRegistry,
      policyVersion: "1.0.0",
    };
    expect(evaluatePolicySync(input).decision).toBe(expected);
  });
});