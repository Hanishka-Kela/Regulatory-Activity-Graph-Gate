import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { extractEvidenceFromFile } from "../../src/evidence/extractor.js";
import { buildGraphFromEvidence } from "../../src/graph/builder.js";
import { buildBaselineGraph } from "../../fixtures/baseline.js";
import { computeGraphDelta } from "../../src/graph/diff.js";
import { evaluatePolicySync } from "../../src/policy/evaluator.js";
import type { ApprovedPartnerRegistry } from "../../src/policy/types.js";

const source = (name: string) => resolve("fixtures/source", name);
const build = (name: string) => buildGraphFromEvidence(extractEvidenceFromFile(source(name), { commitSha: "source-commit" }), "source-commit");
const partners: ApprovedPartnerRegistry = { version: "1", updatedAt: "2026-08-25T00:00:00Z", partners: [{ actorId: "actor:partner_x", name: "Partner X", roles: ["NBFC"], approvedAt: "2026-08-25T00:00:00Z", approvedBy: "test" }] };
const result = (graph: ReturnType<typeof buildGraphFromEvidence>) => evaluatePolicySync({ delta: computeGraphDelta(buildBaselineGraph(), graph), proposedGraph: graph, approvedPartners: partners, policyVersion: "test" });

describe("ActivityGraphBuilder evidence path", () => {
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
    expect(result(graph).decision).toBe("BLOCK");
    expect(result(graph).violations).toEqual(expect.arrayContaining([expect.objectContaining({ policyId: "DL-01", severity: "BLOCK" })]));
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
