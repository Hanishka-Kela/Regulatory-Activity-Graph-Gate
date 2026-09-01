import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { extractEvidenceFromFile } from "../../src/evidence/extractor.js";
import { buildGraphFromEvidence } from "../../src/graph/builder.js";
import { buildBaselineGraph } from "../../fixtures/baseline.js";
import { computeGraphDelta, isDeltaEmpty } from "../../src/graph/diff.js";
import { evaluatePolicySync } from "../../src/policy/evaluator.js";
import type { ApprovedPartnerRegistry } from "../../src/policy/types.js";

const source = (name: string) => resolve("fixtures/source", name);
const build = (name: string) => buildGraphFromEvidence(extractEvidenceFromFile(source(name), { commitSha: "source-commit" }), "source-commit");
const partners: ApprovedPartnerRegistry = { version: "1", updatedAt: "2026-08-25T00:00:00Z", partners: [{ actorId: "actor:partner_x", name: "Partner X", roles: ["NBFC"], approvedAt: "2026-08-25T00:00:00Z", approvedBy: "test" }] };
const result = (graph: ReturnType<typeof buildGraphFromEvidence>) => evaluatePolicySync({ delta: computeGraphDelta(buildBaselineGraph(), graph), proposedGraph: graph, approvedPartners: partners, policyVersion: "test" });

describe("ActivityGraphBuilder evidence path", () => {
  it("reconstructs the approved baseline from a real source flow", () => {
    const graph = build("pass-flow.ts");
    expect(graph.moneyEdges[1]).toMatchObject({ settlementDelayDays: 1 });
    expect(isDeltaEmpty(computeGraphDelta(buildBaselineGraph(), graph))).toBe(true);
    expect(result(graph)).toMatchObject({ decision: "PASS", violations: [] });
  });

  it("ignores logging, labels, source locations, and provenance for canonical PASS", () => {
    const plain = build("pass-flow.ts");
    const logging = build("pass-flow-logging.ts");
    expect(plain.hash).toBe(logging.hash);
    expect(isDeltaEmpty(computeGraphDelta(buildBaselineGraph(), logging))).toBe(true);
    expect(result(logging).decision).toBe("PASS");
  });

  it("reviews declaration-only source because it removes the approved topology", () => {
    const graph = build("sdk-modules.d.ts");
    const evaluation = result(graph);
    expect(graph.actors).toHaveLength(0);
    expect(evaluation.decision).toBe("REVIEW");
    expect(evaluation.violations).toEqual([
      expect.objectContaining({ policyId: "TOPOLOGY-CHANGE", severity: "REVIEW" }),
    ]);
  });

  it("accepts only a non-negative integer settlement delay", () => {
    const evidence = extractEvidenceFromFile(source("pass-flow.ts"), { commitSha: "source-commit" });
    const invalid = evidence.map((atom) => atom.symbol === "partnerXClient.transfer" && atom.arguments.arg9
      ? { ...atom, arguments: { ...atom.arguments, arg9: { type: "LITERAL" as const, value: -1 } } }
      : atom);
    const graph = buildGraphFromEvidence(invalid, "source-commit");
    expect(graph.moneyEdges.every((edge) => edge.settlementDelayDays === undefined)).toBe(true);
  });

  it("maps real extracted Partner X evidence to the frozen review obligation", () => {
    const graph = build("review-flow.ts");
    expect(graph.obligations).toMatchObject([{ debtorActorId: "actor:customer", creditorActorId: "actor:partner_x", tenorDays: 90, installments: 3, financingFeeBps: 150 }]);
    expect(graph.moneyEdges).toMatchObject([{ sourceAccountId: "acc:customer:wallet", destinationAccountId: "acc:partner_x:loan_pool", mechanism: "EXTERNAL_API_ROUTING" }]);
    expect(result(graph).decision).toBe("REVIEW");
  });

  it("maps real extracted transfer evidence to the frozen pool pass-through topology", () => {
    const graph = build("block-flow.ts");
    expect(graph.moneyEdges.map((edge) => edge.mechanism)).toEqual(["POOL_PASS_THROUGH", "DIRECT_BANK_TRANSFER"]);
    expect(graph.accounts.find((account) => account.id === "acc:treasury:pool")).toMatchObject({ custody: "THIRD_PARTY", ownerActorId: "actor:treasury" });
    expect(graph.obligations).toMatchObject([{ debtorActorId: "actor:borrower", creditorActorId: "actor:partner_x" }]);
    expect(result(graph).decision).toBe("BLOCK");
    expect(result(graph).violations).toEqual(expect.arrayContaining([expect.objectContaining({ policyId: "DL-01", severity: "BLOCK" })]));
    expect(result(graph).violations.some((violation) => violation.policyId === "PA-01")).toBe(false);
  });

  it("propagates AI uncertainty deterministically to every contributing graph object", () => {
    const evidence = extractEvidenceFromFile(source("review-flow.ts"), { commitSha: "source-commit" })
      .map((atom) => ({ ...atom, derivation: "AI_INFERRED" as const, confidence: "UNCERTAIN" as const }));
    const graph = buildGraphFromEvidence(evidence, "source-commit");
    const objects = [...graph.actors, ...graph.accounts, ...graph.moneyEdges, ...graph.obligations];
    expect(objects).not.toHaveLength(0);
    expect(objects.every((object) => object.derivation === "AI_INFERRED" && object.hasUnverifiedEvidence)).toBe(true);
  });
});
