/**
 * Graph diff computation: ΔG = G_proposed − G_baseline
 *
 * Identity rules (section 18):
 *   Actor       identity = id + type
 *   Account     identity = id + ownerActorId + custody
 *   MoneyEdge   identity = (sourceAccountId, destinationAccountId) — NOT the edge id itself
 *   Obligation  identity = (debtorActorId, creditorActorId)
 *
 * If identity changes: removed + added.
 * If identity remains but financial-semantic fields change: changedMoneyEdges / changedObligations.
 *
 * Known limitation: changedAccounts is not tracked as a separate bucket —
 * this is not actually a gap. Since Account identity is (id, ownerActorId,
 * custody), an owner or custody change necessarily changes identity, so it
 * is already fully captured as remove+add, not silently lost. (An earlier
 * version of this comment incorrectly described a scenario where identity
 * stays the same while those fields change — impossible given the identity
 * definition below; corrected here.)
 */

import type {
  Actor,
  Account,
  MoneyEdge,
  Obligation,
  ActivityGraph,
  GraphDelta,
} from "./types.js";
import {
  canonicalActor,
  canonicalAccount,
  canonicalMoneyEdge,
  canonicalObligation,
} from "./canonical.js";

// ---------------------------------------------------------------------------
// Identity keys
// ---------------------------------------------------------------------------

function actorIdentityKey(a: Actor): string {
  return JSON.stringify({ id: a.id, type: a.type });
}

function accountIdentityKey(a: Account): string {
  return JSON.stringify({ id: a.id, ownerActorId: a.ownerActorId, custody: a.custody });
}

/**
 * MoneyEdge identity = (sourceAccountId, destinationAccountId).
 * Two edges with the same endpoints are the same "slot" in the flow.
 */
function moneyEdgeIdentityKey(e: MoneyEdge): string {
  return JSON.stringify({ src: e.sourceAccountId, dst: e.destinationAccountId });
}

/**
 * Obligation identity = (debtorActorId, creditorActorId).
 */
function obligationIdentityKey(o: Obligation): string {
  return JSON.stringify({ debtor: o.debtorActorId, creditor: o.creditorActorId });
}

// ---------------------------------------------------------------------------
// Semantic equality (Category A fields — does not include provenance/trust)
// ---------------------------------------------------------------------------

function moneyEdgeSemanticKey(e: MoneyEdge): string {
  return JSON.stringify(canonicalMoneyEdge(e));
}

function obligationSemanticKey(o: Obligation): string {
  return JSON.stringify(canonicalObligation(o));
}

// ---------------------------------------------------------------------------
// Generic diff helpers
// ---------------------------------------------------------------------------

/**
 * Diffs a simple collection where identity = full canonical equality.
 * (Actors, Accounts — no changedX concept for these.)
 */
function diffSimple<T>(
  baseline: T[],
  proposed: T[],
  identityKey: (t: T) => string,
): { added: T[]; removed: T[] } {
  const baseMap = new Map<string, T>();
  for (const item of baseline) baseMap.set(identityKey(item), item);

  const propMap = new Map<string, T>();
  for (const item of proposed) propMap.set(identityKey(item), item);

  const added: T[] = [];
  const removed: T[] = [];

  for (const [key, item] of propMap) {
    if (!baseMap.has(key)) added.push(item);
  }
  for (const [key, item] of baseMap) {
    if (!propMap.has(key)) removed.push(item);
  }

  return { added, removed };
}

/**
 * Diffs a collection with a separate semantic key (MoneyEdge, Obligation).
 * If identity matches but semantics differ → changedX.
 */
function diffWithChanges<T>(
  baseline: T[],
  proposed: T[],
  identityKey: (t: T) => string,
  semanticKey: (t: T) => string,
): { added: T[]; removed: T[]; changed: { before: T; after: T }[] } {
  const baseMap = new Map<string, T>();
  for (const item of baseline) baseMap.set(identityKey(item), item);

  const propMap = new Map<string, T>();
  for (const item of proposed) propMap.set(identityKey(item), item);

  const added: T[] = [];
  const removed: T[] = [];
  const changed: { before: T; after: T }[] = [];

  for (const [key, propItem] of propMap) {
    const baseItem = baseMap.get(key);
    if (!baseItem) {
      added.push(propItem);
    } else if (semanticKey(propItem) !== semanticKey(baseItem)) {
      changed.push({ before: baseItem, after: propItem });
    }
  }
  for (const [key, baseItem] of baseMap) {
    if (!propMap.has(key)) removed.push(baseItem);
  }

  return { added, removed, changed };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute ΔG = G_proposed − G_baseline.
 *
 * Returns a GraphDelta describing all added, removed, and (where applicable)
 * changed graph objects between the two graphs.
 */
export function computeGraphDelta(
  baseline: ActivityGraph,
  proposed: ActivityGraph,
): GraphDelta {
  // Actors: identity = {id, type}
  const actors = diffSimple(
    baseline.actors,
    proposed.actors,
    actorIdentityKey,
  );

  // Accounts: identity = {id, ownerActorId, custody}. An owner/custody change
  // is captured as remove+add since those fields are part of identity — see
  // the corrected note in the GraphDelta doc comment above.
  const accounts = diffSimple(
    baseline.accounts,
    proposed.accounts,
    accountIdentityKey,
  );

  // MoneyEdges: identity = (src, dst); may change mechanism/settlementDelayDays
  const edges = diffWithChanges(
    baseline.moneyEdges,
    proposed.moneyEdges,
    moneyEdgeIdentityKey,
    moneyEdgeSemanticKey,
  );

  // Obligations: identity = (debtor, creditor); may change tenor/installments/fee
  const obligations = diffWithChanges(
    baseline.obligations,
    proposed.obligations,
    obligationIdentityKey,
    obligationSemanticKey,
  );

  return {
    addedActors: actors.added,
    removedActors: actors.removed,

    addedAccounts: accounts.added,
    removedAccounts: accounts.removed,

    addedMoneyEdges: edges.added,
    removedMoneyEdges: edges.removed,
    changedMoneyEdges: edges.changed,

    addedObligations: obligations.added,
    removedObligations: obligations.removed,
    changedObligations: obligations.changed,
  };
}

/**
 * Returns true iff the delta contains no changes (empty ΔG).
 */
export function isDeltaEmpty(delta: GraphDelta): boolean {
  return (
    delta.addedActors.length === 0 &&
    delta.removedActors.length === 0 &&
    delta.addedAccounts.length === 0 &&
    delta.removedAccounts.length === 0 &&
    delta.addedMoneyEdges.length === 0 &&
    delta.removedMoneyEdges.length === 0 &&
    delta.changedMoneyEdges.length === 0 &&
    delta.addedObligations.length === 0 &&
    delta.removedObligations.length === 0 &&
    delta.changedObligations.length === 0
  );
}
