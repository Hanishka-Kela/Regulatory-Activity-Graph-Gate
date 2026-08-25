/**
 * Canonical serialization and SHA-256 hashing for ActivityGraph objects.
 *
 * CANONICALIZATION RULES (section 17):
 *
 * Category A — identity / financial semantics — PARTICIPATE in hash:
 *   Actor:       id, type
 *   Account:     id, ownerActorId, custody
 *   MoneyEdge:   id, sourceAccountId, destinationAccountId, mechanism, settlementDelayDays
 *   Obligation:  id, debtorActorId, creditorActorId, tenorDays, installments, financingFeeBps
 *
 * Category B — display provenance — DO NOT participate in hash:
 *   label, evidenceIds, source spans, file paths
 *
 * Category C — trust metadata — DO NOT participate in hash:
 *   derivation, confidence, hasUnverifiedEvidence
 *
 * The hash must be stable: same financial topology → same hash, regardless of
 * evidence quality changes or label changes.
 */

import { createHash } from "node:crypto";
import type {
  Actor,
  Account,
  MoneyEdge,
  Obligation,
  ActivityGraph,
} from "./types.js";

// ---------------------------------------------------------------------------
// Canonical object representations (Category A fields only)
// ---------------------------------------------------------------------------

export type CanonicalActor = {
  id: string;
  type: Actor["type"];
};

export type CanonicalAccount = {
  id: string;
  ownerActorId: string;
  custody: Account["custody"];
};

export type CanonicalMoneyEdge = {
  sourceAccountId: string;
  destinationAccountId: string;
  mechanism: MoneyEdge["mechanism"];
  settlementDelayDays: number | null;
};

export type CanonicalObligation = {
  debtorActorId: string;
  creditorActorId: string;
  tenorDays: number | null;
  installments: number | null;
  financingFeeBps: number | null;
};

export type CanonicalGraph = {
  actors: CanonicalActor[];
  accounts: CanonicalAccount[];
  moneyEdges: CanonicalMoneyEdge[];
  obligations: CanonicalObligation[];
};

// ---------------------------------------------------------------------------
// Canonical projections
// ---------------------------------------------------------------------------

export function canonicalActor(a: Actor): CanonicalActor {
  return { id: a.id, type: a.type };
}

export function canonicalAccount(a: Account): CanonicalAccount {
  return { id: a.id, ownerActorId: a.ownerActorId, custody: a.custody };
}

export function canonicalMoneyEdge(e: MoneyEdge): CanonicalMoneyEdge {
  return {
    sourceAccountId: e.sourceAccountId,
    destinationAccountId: e.destinationAccountId,
    mechanism: e.mechanism,
    // Use null (not undefined) so JSON.stringify produces a stable key
    settlementDelayDays: e.settlementDelayDays ?? null,
  };
}

export function canonicalObligation(o: Obligation): CanonicalObligation {
  return {
    debtorActorId: o.debtorActorId,
    creditorActorId: o.creditorActorId,
    tenorDays: o.tenorDays ?? null,
    installments: o.installments ?? null,
    financingFeeBps: o.financingFeeBps ?? null,
  };
}

// ---------------------------------------------------------------------------
// Stable sort helpers (lexicographic on `id`)
// ---------------------------------------------------------------------------

function byId<T extends { id: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.id.localeCompare(b.id));
}

function byMoneyEdgeIdentity(arr: MoneyEdge[]): MoneyEdge[] {
  return [...arr].sort((a, b) => `${a.sourceAccountId}\u0000${a.destinationAccountId}`.localeCompare(`${b.sourceAccountId}\u0000${b.destinationAccountId}`));
}

function byObligationIdentity(arr: Obligation[]): Obligation[] {
  return [...arr].sort((a, b) => `${a.debtorActorId}\u0000${a.creditorActorId}`.localeCompare(`${b.debtorActorId}\u0000${b.creditorActorId}`));
}

// ---------------------------------------------------------------------------
// Full canonical graph serialization
// ---------------------------------------------------------------------------

/**
 * Returns a deterministically sorted, minified JSON string of the canonical
 * graph — suitable as the hash pre-image.
 *
 * Sorting is by `id` for each collection. JSON.stringify with sorted keys
 * is ensured by the object literal ordering in the canonical types above.
 */
export function serializeCanonicalGraph(graph: ActivityGraph): string {
  const canonical: CanonicalGraph = {
    actors: byId(graph.actors).map(canonicalActor),
    accounts: byId(graph.accounts).map(canonicalAccount),
    moneyEdges: byMoneyEdgeIdentity(graph.moneyEdges).map(canonicalMoneyEdge),
    obligations: byObligationIdentity(graph.obligations).map(canonicalObligation),
  };
  return JSON.stringify(canonical);
}

// ---------------------------------------------------------------------------
// SHA-256 hash
// ---------------------------------------------------------------------------

/**
 * Returns a hex SHA-256 digest of the canonical graph.
 * This is Category A identity — it must not change unless financial topology changes.
 */
export function hashGraph(graph: ActivityGraph): string {
  const preimage = serializeCanonicalGraph(graph);
  return createHash("sha256").update(preimage, "utf8").digest("hex");
}

/**
 * Recomputes the canonical hash and verifies it matches the stored hash.
 * Use this when loading a baseline to detect tampering or staleness.
 */
export function verifyGraphHash(graph: ActivityGraph): boolean {
  return hashGraph(graph) === graph.hash;
}
