import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import { applyExtractionFailsafe, failsafe, findSemanticCandidates, replaySemanticResponse } from "../../src/evidence/ai-fallback.js";

const source = resolve("fixtures/evaluation/candidate-triage.ts");

function labelledCalls() {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const file = project.addSourceFileAtPath(source);
  return file.getFunctions().flatMap((fn) => {
    const name = fn.getName() ?? "";
    const label = name.startsWith("relevant") ? "relevant" : name.startsWith("irrelevant") ? "irrelevant" : undefined;
    if (!label) return [];
    const call = fn.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
    const start = file.getLineAndColumnAtPos(call.getStart());
    return [{ label, key: `${start.line}:${start.column}` }];
  });
}

describe("offline candidate-triage evaluation set", () => {
  it("derives the labelled confusion matrix and metrics reproducibly", () => {
    const candidates = findSemanticCandidates(source, "evaluation");
    const detected = new Set(candidates.map((candidate) => `${candidate.span.startLine}:${candidate.span.startColumn}`));
    const labels = labelledCalls();
    const tp = labels.filter(({ label, key }) => label === "relevant" && detected.has(key)).length;
    const fp = labels.filter(({ label, key }) => label === "irrelevant" && detected.has(key)).length;
    const fn = labels.filter(({ label, key }) => label === "relevant" && !detected.has(key)).length;
    const tn = labels.filter(({ label, key }) => label === "irrelevant" && !detected.has(key)).length;
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);

    expect(labels).toHaveLength(40);
    expect({ tp, fp, fn, tn, precision, recall }).toEqual({ tp: 15, fp: 0, fn: 5, tn: 20, precision: 1, recall: 0.75 });
  });

  it("turns schema-invalid fallback output into a REVIEW failsafe", () => {
    const candidate = findSemanticCandidates(source, "evaluation")[0]!;
    const outcome = replaySemanticResponse(candidate, { relevant: true });
    const result = applyExtractionFailsafe(
      { decision: "PASS", violations: [], policyVersion: "evaluation", evaluatedAt: "now" },
      outcome,
    );
    expect(result).toMatchObject({ decision: "REVIEW", violations: [expect.objectContaining({ policyId: "EXTRACTION_FAILSAFE" })] });
    expect(failsafe("unavailable").failsafe?.severity).toBe("REVIEW");
  });
});
