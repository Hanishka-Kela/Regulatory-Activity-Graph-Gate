/**
 * Core data model for the Regulatory Activity Graph Gate.
 *
 * SCHEMA VERSION: 2 (sections 13 & 14 corrected schema — supersedes Phase 1 draft).
 *
 * Custody enum:    CUSTOMER | MERCHANT | RE | ESCROW_BANK | THIRD_PARTY | UNKNOWN
 * Mechanism enum:  DIRECT_BANK_TRANSFER | INTERNAL_LEDGER_TRANSFER | ESCROW |
 *                  EXTERNAL_API_ROUTING | POOL_PASS_THROUGH | UNKNOWN
 * Settlement delay: flattened as `settlementDelayDays` (was `timing.delayDays` in
 *                   Phase 1 draft — do NOT re-introduce the nested form).
 */

// ---------------------------------------------------------------------------
// Value type
// ---------------------------------------------------------------------------

/**
 * A concrete literal extracted directly from the AST.
 * Example: feeBps: 150, tenorMonths: 3, method: "PAY_LATER"
 */
export type LiteralValue = {
  type: "LITERAL";
  value: string | number | boolean | null;
};

/**
 * A resolvable identifier or property-access chain that was NOT inlined to a
 * concrete value. Example: amount, customerId, config.destination
 */
export type ReferenceValue = {
  type: "REFERENCE";
  expression: string;
};

/**
 * An expression that cannot be safely represented without interpretation.
 * Example: calculateDestination(order), condition ? a : b, { ...config }
 * NEVER convert UNKNOWN into a guessed concrete value.
 */
export type UnknownValue = {
  type: "UNKNOWN";
  expression: string;
};

export type Value = LiteralValue | ReferenceValue | UnknownValue;

// ---------------------------------------------------------------------------
// EvidenceAtom
// ---------------------------------------------------------------------------

export type EvidenceDerivation = "DETERMINISTIC_ADAPTER" | "AI_INFERRED";

export type EvidenceConfidence = "SUPPORTED" | "UNCERTAIN";

export interface EvidenceAtom {
  id: string;

  source: {
    commitSha: string;
    file: string;
    span: {
      startLine: number;
      endLine: number;
      startColumn: number;
      endColumn: number;
    };
  };

  kind:
    | "EXTERNAL_CALL"
    | "HTTP_REQUEST"
    | "ACCOUNT_REFERENCE"
    | "CONFIG_REFERENCE"
    | "OBLIGATION_LITERAL";

  symbol: string;
  operation?: string;

  arguments: Record<string, Value>;

  execution: {
    isInsideFunction: boolean;
    isReachableFromExportedHandler: boolean;
    isAwaited: boolean;
  };

  derivation: EvidenceDerivation;
  confidence: EvidenceConfidence;
}

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------

export interface Actor {
  id: string;
  label: string;

  type:
    | "CUSTOMER"
    | "MERCHANT"
    | "PAYMENT_PROVIDER"
    | "FINANCING_PROVIDER"
    | "THIRD_PARTY"
    | "UNKNOWN";

  /** Derivation of all contributing EvidenceAtoms:
   *  - all deterministic → DETERMINISTIC
   *  - all AI inferred   → AI_INFERRED
   *  - mix               → MIXED
   */
  derivation: "DETERMINISTIC" | "AI_INFERRED" | "MIXED";

  /** true iff any contributing EvidenceAtom has derivation=AI_INFERRED and confidence=UNCERTAIN */
  hasUnverifiedEvidence: boolean;

  evidenceIds: string[];
}

// ---------------------------------------------------------------------------
// Account — CORRECTED SCHEMA (section 13)
// ---------------------------------------------------------------------------

/**
 * Custody enum (section 13):
 *  - CUSTOMER     — account ultimately controlled by the end-customer
 *  - MERCHANT     — account owned/controlled by the merchant
 *  - RE           — Regulated Entity (PA, NBFC, bank) account
 *  - ESCROW_BANK  — designated escrow/nodal account at a bank
 *  - THIRD_PARTY  — account controlled by a third party (potential policy concern)
 *  - UNKNOWN      — cannot safely determine
 */
export interface Account {
  id: string;
  label: string;

  ownerActorId: string;

  custody:
    | "CUSTOMER"
    | "MERCHANT"
    | "RE"
    | "ESCROW_BANK"
    | "THIRD_PARTY"
    | "UNKNOWN";

  derivation: "DETERMINISTIC" | "AI_INFERRED" | "MIXED";
  hasUnverifiedEvidence: boolean;
  evidenceIds: string[];
}

// ---------------------------------------------------------------------------
// MoneyEdge — CORRECTED SCHEMA (section 14)
// ---------------------------------------------------------------------------

/**
 * Mechanism enum (section 14):
 *  - DIRECT_BANK_TRANSFER      — direct bank-to-bank fund transfer
 *  - INTERNAL_LEDGER_TRANSFER  — within the RE's own ledger system
 *  - ESCROW                    — movement into/out of a designated escrow account
 *  - EXTERNAL_API_ROUTING      — routed via an external API / third-party system
 *  - POOL_PASS_THROUGH         — funds routed through a pool/treasury account before
 *                                reaching the destination (prohibited in DL-01 context)
 *  - UNKNOWN                   — cannot safely determine
 *
 * `settlementDelayDays` is flattened (was `timing.delayDays` in Phase 1 draft).
 */
export interface MoneyEdge {
  id: string;
  label: string;

  sourceAccountId: string;
  destinationAccountId: string;

  mechanism:
    | "DIRECT_BANK_TRANSFER"
    | "INTERNAL_LEDGER_TRANSFER"
    | "ESCROW"
    | "EXTERNAL_API_ROUTING"
    | "POOL_PASS_THROUGH"
    | "UNKNOWN";

  /**
   * Optional settlement delay in whole calendar days.
   * Flattened field — do NOT nest as timing.delayDays.
   */
  settlementDelayDays?: number;

  derivation: "DETERMINISTIC" | "AI_INFERRED" | "MIXED";
  hasUnverifiedEvidence: boolean;
  evidenceIds: string[];
}

// ---------------------------------------------------------------------------
// Obligation
// ---------------------------------------------------------------------------

export interface Obligation {
  id: string;
  label: string;

  /** The party that owes the obligation */
  debtorActorId: string;

  /** The party that is owed */
  creditorActorId: string;

  tenorDays?: number;
  installments?: number;
  financingFeeBps?: number;

  derivation: "DETERMINISTIC" | "AI_INFERRED" | "MIXED";
  hasUnverifiedEvidence: boolean;
  evidenceIds: string[];
}

// ---------------------------------------------------------------------------
// ActivityGraph
// ---------------------------------------------------------------------------

export interface ActivityGraph {
  /** Canonical graph hash (SHA-256 over identity + financial-semantic fields only) */
  hash: string;

  actors: Actor[];
  accounts: Account[];
  moneyEdges: MoneyEdge[];
  obligations: Obligation[];

  metadata: {
    /** Git commit SHA from which G_proposed was derived, or baseline commit for G_baseline */
    commitSha: string;
    createdAt: string;
    label?: string;
  };
}

// ---------------------------------------------------------------------------
// GraphDelta
// ---------------------------------------------------------------------------

/**
 * ΔG = G_proposed − G_baseline
 *
 * Note on changedAccounts: there is no changedAccounts collection, and this
 * is not actually a limitation given how Account identity is defined.
 * Account identity = (id, ownerActorId, custody) — see accountIdentityKey in
 * diff.ts. Since ownerActorId and custody are themselves part of identity,
 * an account's owner or custody cannot change while its identity stays the
 * same; any such change is already fully captured as remove+add, exactly
 * like a MoneyEdge whose destination changes. An earlier draft of this
 * comment described a scenario ("identity stays the same but those values
 * change") that is impossible under this identity definition — corrected
 * here rather than left in place.
 */
export interface GraphDelta {
  addedActors: Actor[];
  removedActors: Actor[];

  addedAccounts: Account[];
  removedAccounts: Account[];

  addedMoneyEdges: MoneyEdge[];
  removedMoneyEdges: MoneyEdge[];
  changedMoneyEdges: { before: MoneyEdge; after: MoneyEdge }[];

  addedObligations: Obligation[];
  removedObligations: Obligation[];
  changedObligations: { before: Obligation; after: Obligation }[];
}
