/**
 * Phase 1 tests: Replay stability (section 30)
 *
 * For every fixture, 100 replays must produce:
 * - identical canonical graph hash
 * - identical delta shape (same counts in every collection)
 * - stable isDeltaEmpty result
 */

import { describe, it, expect } from "vitest";
import { hashGraph } from "../../src/graph/canonical.js";
import { computeGraphDelta, isDeltaEmpty } from "../../src/graph/diff.js";
import {
  buildBaselineGraph,
} from "../../fixtures/baseline.js";
import { buildPassGraph } from "../../fixtures/case-pass.js";
import { buildReviewGraph } from "../../fixtures/case-review.js";
import { buildBlockGraph } from "../../fixtures/case-block.js";
import { buildAmbiguousGraph } from "../../fixtures/case-ambiguous.js";

const REPLAY_COUNT = 100;

function deltaShape(delta: ReturnType<typeof computeGraphDelta>) {
  return {
    addedActors: delta.addedActors.length,
    removedActors: delta.removedActors.length,
    addedAccounts: delta.addedAccounts.length,
    removedAccounts: delta.removedAccounts.length,
    addedMoneyEdges: delta.addedMoneyEdges.length,
    removedMoneyEdges: delta.removedMoneyEdges.length,
    changedMoneyEdges: delta.changedMoneyEdges.length,
    addedObligations: delta.addedObligations.length,
    removedObligations: delta.removedObligations.length,
    changedObligations: delta.changedObligations.length,
  };
}

describe("100-replay hash stability", () => {
  it("baseline hash is stable across 100 builds", () => {
    const first = buildBaselineGraph();
    const expected = hashGraph(first);
    for (let i = 0; i < REPLAY_COUNT; i++) {
      const g = buildBaselineGraph();
      expect(hashGraph(g)).toBe(expected);
    }
  });

  it("PASS graph hash is stable across 100 builds", () => {
    const first = buildPassGraph();
    const expected = hashGraph(first);
    for (let i = 0; i < REPLAY_COUNT; i++) {
      const g = buildPassGraph();
      expect(hashGraph(g)).toBe(expected);
    }
  });

  it("PASS and baseline hashes are equal", () => {
    expect(hashGraph(buildBaselineGraph())).toBe(hashGraph(buildPassGraph()));
  });

  it("REVIEW graph hash is stable across 100 builds", () => {
    const first = buildReviewGraph();
    const expected = hashGraph(first);
    for (let i = 0; i < REPLAY_COUNT; i++) {
      const g = buildReviewGraph();
      expect(hashGraph(g)).toBe(expected);
    }
  });

  it("BLOCK graph hash is stable across 100 builds", () => {
    const first = buildBlockGraph();
    const expected = hashGraph(first);
    for (let i = 0; i < REPLAY_COUNT; i++) {
      const g = buildBlockGraph();
      expect(hashGraph(g)).toBe(expected);
    }
  });

  it("AMBIGUOUS graph hash is stable across 100 builds", () => {
    const first = buildAmbiguousGraph();
    const expected = hashGraph(first);
    for (let i = 0; i < REPLAY_COUNT; i++) {
      const g = buildAmbiguousGraph();
      expect(hashGraph(g)).toBe(expected);
    }
  });

  it("different semantic graphs produce different hashes", () => {
    const passHash = hashGraph(buildPassGraph());
    const reviewHash = hashGraph(buildReviewGraph());
    const blockHash = hashGraph(buildBlockGraph());
    const ambiguousHash = hashGraph(buildAmbiguousGraph());

    // All four must be distinct (pass == baseline, so check baseline too)
    const hashes = new Set([passHash, reviewHash, blockHash, ambiguousHash]);
    expect(hashes.size).toBe(4);
  });
});

describe("100-replay delta shape stability", () => {
  it("PASS delta shape is stable across 100 replays", () => {
    const baseline = buildBaselineGraph();
    const expected = deltaShape(computeGraphDelta(baseline, buildPassGraph()));
    for (let i = 0; i < REPLAY_COUNT; i++) {
      const g = buildPassGraph();
      expect(deltaShape(computeGraphDelta(baseline, g))).toEqual(expected);
    }
  });

  it("PASS delta isEmpty is stable across 100 replays", () => {
    const baseline = buildBaselineGraph();
    for (let i = 0; i < REPLAY_COUNT; i++) {
      expect(isDeltaEmpty(computeGraphDelta(baseline, buildPassGraph()))).toBe(true);
    }
  });

  it("REVIEW delta shape is stable across 100 replays", () => {
    const baseline = buildBaselineGraph();
    const expected = deltaShape(computeGraphDelta(baseline, buildReviewGraph()));
    for (let i = 0; i < REPLAY_COUNT; i++) {
      const g = buildReviewGraph();
      expect(deltaShape(computeGraphDelta(baseline, g))).toEqual(expected);
    }
  });

  it("BLOCK delta shape is stable across 100 replays", () => {
    const baseline = buildBaselineGraph();
    const expected = deltaShape(computeGraphDelta(baseline, buildBlockGraph()));
    for (let i = 0; i < REPLAY_COUNT; i++) {
      const g = buildBlockGraph();
      expect(deltaShape(computeGraphDelta(baseline, g))).toEqual(expected);
    }
  });

  it("AMBIGUOUS delta shape is stable across 100 replays", () => {
    const baseline = buildBaselineGraph();
    const expected = deltaShape(computeGraphDelta(baseline, buildAmbiguousGraph()));
    for (let i = 0; i < REPLAY_COUNT; i++) {
      const g = buildAmbiguousGraph();
      expect(deltaShape(computeGraphDelta(baseline, g))).toEqual(expected);
    }
  });
});
