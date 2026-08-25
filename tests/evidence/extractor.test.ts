import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { extractEvidenceFromFile } from "../../src/evidence/extractor.js";

const fixture = (name: string) => resolve("fixtures/source", name);
const options = { commitSha: "commit-phase-3" };

describe("deterministic evidence extraction", () => {
  it("extracts only resolved adapters with exact value classifications and execution metadata", () => {
    const atoms = extractEvidenceFromFile(fixture("adapters.ts"), options);
    expect(atoms).toHaveLength(3);
    expect(atoms.map((atom) => atom.symbol)).toEqual([
      "razorpayClient.payments.create",
      "partnerXClient.credit.createInstallmentPlan",
      "partnerXClient.transfer",
    ]);
    expect(atoms[0]).toMatchObject({
      arguments: {
        arg0: { type: "LITERAL", value: "order-1" },
        arg1: { type: "REFERENCE", expression: "amount" },
        arg2: { type: "REFERENCE", expression: "paymentConfig.destination" },
      },
      execution: { isInsideFunction: true, isReachableFromExportedHandler: true, isAwaited: true },
      derivation: "DETERMINISTIC_ADAPTER",
      confidence: "SUPPORTED",
      source: {
        file: fixture("adapters.ts"),
        span: { startLine: 10, startColumn: 9, endLine: 10, endColumn: 85 },
      },
    });
    expect(atoms[1]).toMatchObject({
      arguments: {
        arg0: { type: "LITERAL", value: 90 },
        arg1: { type: "REFERENCE", expression: "customerId" },
        arg2: { type: "UNKNOWN", expression: 'condition ? "three" : "one"' },
      },
      source: { span: { startLine: 14, startColumn: 10, endLine: 14, endColumn: 98 } },
    });
    expect(atoms[2]).toMatchObject({
      arguments: { arg0: { type: "UNKNOWN", expression: "{ amount }" } },
      execution: { isAwaited: false },
      source: { span: { startLine: 18, startColumn: 3, endLine: 18, endColumn: 38 } },
    });
  });

  it("records unreachable and one-hop reachable calls without suppressing either", () => {
    const atoms = extractEvidenceFromFile(fixture("reachability.ts"), options);
    expect(atoms).toHaveLength(2);
    expect(atoms.map((atom) => atom.execution.isReachableFromExportedHandler)).toEqual([false, true]);
  });

  it("does not treat comments, type members, or coincidental local names as SDK evidence", () => {
    expect(extractEvidenceFromFile(fixture("non-adapter.ts"), options)).toEqual([]);
  });

  it("is byte-identical when the same source is parsed twice", () => {
    expect(JSON.stringify(extractEvidenceFromFile(fixture("adapters.ts"), options)))
      .toBe(JSON.stringify(extractEvidenceFromFile(fixture("adapters.ts"), options)));
  });
});
