/**
 * Evidence contracts are owned by the graph core for backwards compatibility.
 * Re-exporting them here gives extraction code the Phase 3 module boundary
 * without creating a second, drifting definition.
 */
export type {
  EvidenceAtom,
  EvidenceConfidence,
  EvidenceDerivation,
  Value,
} from "../graph/types.js";
