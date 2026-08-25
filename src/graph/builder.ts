/**
 * ActivityGraphBuilder — constructs and validates an ActivityGraph.
 *
 * Validates every graph object against Zod schemas before adding it.
 * Calls hashGraph() to produce a stable canonical hash on build().
 */

import { z } from "zod";
import type {
  Actor,
  Account,
  MoneyEdge,
  Obligation,
  ActivityGraph,
  EvidenceAtom,
} from "./types.js";
import { hashGraph } from "./canonical.js";

// ---------------------------------------------------------------------------
// Zod schemas (validate before insertion)
// ---------------------------------------------------------------------------

const ActorSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  type: z.enum([
    "CUSTOMER",
    "MERCHANT",
    "PAYMENT_PROVIDER",
    "FINANCING_PROVIDER",
    "THIRD_PARTY",
    "UNKNOWN",
  ]),
  derivation: z.enum(["DETERMINISTIC", "AI_INFERRED", "MIXED"]),
  hasUnverifiedEvidence: z.boolean(),
  evidenceIds: z.array(z.string()),
});

const AccountSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  ownerActorId: z.string().min(1),
  custody: z.enum(["CUSTOMER", "MERCHANT", "RE", "ESCROW_BANK", "THIRD_PARTY", "UNKNOWN"]),
  derivation: z.enum(["DETERMINISTIC", "AI_INFERRED", "MIXED"]),
  hasUnverifiedEvidence: z.boolean(),
  evidenceIds: z.array(z.string()),
});

const MoneyEdgeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  sourceAccountId: z.string().min(1),
  destinationAccountId: z.string().min(1),
  mechanism: z.enum([
    "DIRECT_BANK_TRANSFER",
    "INTERNAL_LEDGER_TRANSFER",
    "ESCROW",
    "EXTERNAL_API_ROUTING",
    "POOL_PASS_THROUGH",
    "UNKNOWN",
  ]),
  settlementDelayDays: z.number().int().nonnegative().optional(),
  derivation: z.enum(["DETERMINISTIC", "AI_INFERRED", "MIXED"]),
  hasUnverifiedEvidence: z.boolean(),
  evidenceIds: z.array(z.string()),
});

const ObligationSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  debtorActorId: z.string().min(1),
  creditorActorId: z.string().min(1),
  tenorDays: z.number().int().positive().optional(),
  installments: z.number().int().positive().optional(),
  financingFeeBps: z.number().int().nonnegative().optional(),
  derivation: z.enum(["DETERMINISTIC", "AI_INFERRED", "MIXED"]),
  hasUnverifiedEvidence: z.boolean(),
  evidenceIds: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class ActivityGraphBuilder {
  private actors: Actor[] = [];
  private accounts: Account[] = [];
  private moneyEdges: MoneyEdge[] = [];
  private obligations: Obligation[] = [];

  private actorIds = new Set<string>();
  private accountIds = new Set<string>();
  private moneyEdgeIds = new Set<string>();
  private obligationIds = new Set<string>();
  private moneyEdgeEndpoints = new Set<string>();
  private obligationParties = new Set<string>();

  addActor(actor: Actor): this {
    ActorSchema.parse(actor);
    if (this.actorIds.has(actor.id)) {
      throw new Error(`Duplicate actor id: ${actor.id}`);
    }
    this.actorIds.add(actor.id);
    this.actors.push(actor);
    return this;
  }

  addAccount(account: Account): this {
    AccountSchema.parse(account);
    if (this.accountIds.has(account.id)) {
      throw new Error(`Duplicate account id: ${account.id}`);
    }
    // Referential integrity: ownerActorId must exist
    if (!this.actorIds.has(account.ownerActorId)) {
      throw new Error(
        `Account ${account.id} references unknown actor ${account.ownerActorId}`,
      );
    }
    this.accountIds.add(account.id);
    this.accounts.push(account);
    return this;
  }

  addMoneyEdge(edge: MoneyEdge): this {
    MoneyEdgeSchema.parse(edge);
    if (this.moneyEdgeIds.has(edge.id)) {
      throw new Error(`Duplicate money edge id: ${edge.id}`);
    }
    const endpoints = `${edge.sourceAccountId}\u0000${edge.destinationAccountId}`;
    if (this.moneyEdgeEndpoints.has(endpoints)) {
      throw new Error(`Duplicate money edge endpoints: ${edge.sourceAccountId} -> ${edge.destinationAccountId}`);
    }
    if (!this.accountIds.has(edge.sourceAccountId)) {
      throw new Error(
        `MoneyEdge ${edge.id} references unknown source account ${edge.sourceAccountId}`,
      );
    }
    if (!this.accountIds.has(edge.destinationAccountId)) {
      throw new Error(
        `MoneyEdge ${edge.id} references unknown destination account ${edge.destinationAccountId}`,
      );
    }
    this.moneyEdgeIds.add(edge.id);
    this.moneyEdgeEndpoints.add(endpoints);
    this.moneyEdges.push(edge);
    return this;
  }

  addObligation(obligation: Obligation): this {
    ObligationSchema.parse(obligation);
    if (this.obligationIds.has(obligation.id)) {
      throw new Error(`Duplicate obligation id: ${obligation.id}`);
    }
    const parties = `${obligation.debtorActorId}\u0000${obligation.creditorActorId}`;
    if (this.obligationParties.has(parties)) {
      throw new Error(`Duplicate obligation parties: ${obligation.debtorActorId} -> ${obligation.creditorActorId}`);
    }
    if (!this.actorIds.has(obligation.debtorActorId)) {
      throw new Error(
        `Obligation ${obligation.id} references unknown debtor actor ${obligation.debtorActorId}`,
      );
    }
    if (!this.actorIds.has(obligation.creditorActorId)) {
      throw new Error(
        `Obligation ${obligation.id} references unknown creditor actor ${obligation.creditorActorId}`,
      );
    }
    this.obligationIds.add(obligation.id);
    this.obligationParties.add(parties);
    this.obligations.push(obligation);
    return this;
  }

  build(commitSha: string, label?: string): ActivityGraph {
    const partial: Omit<ActivityGraph, "hash"> = {
      actors: this.actors,
      accounts: this.accounts,
      moneyEdges: this.moneyEdges,
      obligations: this.obligations,
      metadata: {
        commitSha,
        createdAt: new Date().toISOString(),
        label,
      },
    };

    // Compute the hash over the canonical (Category A) fields
    const withPlaceholder: ActivityGraph = { ...partial, hash: "" };
    const hash = hashGraph(withPlaceholder);

    return { ...partial, hash };
  }
}

/**
 * Fixed Phase 4 mapping for the three Phase 3 adapters. The tuple layouts are
 * deliberately fixture-authored and concrete; this is not an adapter registry.
 * A Razorpay payment without a separately evidenced transfer destination adds
 * no money edge, because its atom alone establishes no destination account.
 */
export function buildGraphFromEvidence(
  evidence: EvidenceAtom[],
  commitSha: string,
  label?: string,
): ActivityGraph {
  const actors = new Map<string, Actor>();
  const accounts = new Map<string, Account>();
  const edges = new Map<string, MoneyEdge>();
  const obligations = new Map<string, Obligation>();

  const addActor = (id: string, type: Actor["type"], atom: EvidenceAtom) => merge(actors, {
    id, label: id, type, ...provenance([atom]),
  });
  const addAccount = (id: string, ownerActorId: string, custody: Account["custody"], atom: EvidenceAtom) => merge(accounts, {
    id, label: id, ownerActorId, custody, ...provenance([atom]),
  });

  for (const atom of evidence) {
    // A bare payments.create atom has no independently evidenced destination
    // account in Phase 3. It is intentionally not converted into a money edge.
    if (atom.symbol === "razorpayClient.payments.create") continue;
    if (atom.derivation === "AI_INFERRED" && atom.confidence === "UNCERTAIN") {
      const unknownActor = `unknown:${atom.id}:actor`;
      addActor(unknownActor, "UNKNOWN", atom);
    }
    if (atom.symbol === "partnerXClient.credit.createInstallmentPlan") {
      const debtor = stringValue(atom, "arg0", "debtor-actor");
      const creditor = stringValue(atom, "arg1", "creditor-actor");
      addActor(debtor, "CUSTOMER", atom);
      addActor(creditor, "FINANCING_PROVIDER", atom);
      merge(obligations, {
        id: `obligation:${debtor}:${creditor}`,
        label: "Partner X installment plan",
        debtorActorId: debtor,
        creditorActorId: creditor,
        tenorDays: positiveNumber(atom.arguments.arg2),
        installments: positiveNumber(atom.arguments.arg3),
        financingFeeBps: nonNegativeNumber(atom.arguments.arg4),
        ...provenance([atom]),
      });
    }

    if (atom.symbol === "partnerXClient.transfer") {
      const sourceAccountId = stringValue(atom, "arg0", "source-account");
      const destinationAccountId = stringValue(atom, "arg1", "destination-account");
      const sourceActorId = stringValue(atom, "arg3", "source-actor");
      const destinationActorId = stringValue(atom, "arg6", "destination-actor");
      const sourceType = enumValue<Actor["type"]>(atom.arguments.arg4, ["CUSTOMER", "MERCHANT", "PAYMENT_PROVIDER", "FINANCING_PROVIDER", "THIRD_PARTY"], "UNKNOWN");
      const destinationType = enumValue<Actor["type"]>(atom.arguments.arg7, ["CUSTOMER", "MERCHANT", "PAYMENT_PROVIDER", "FINANCING_PROVIDER", "THIRD_PARTY"], "UNKNOWN");
      const sourceCustody = enumValue<Account["custody"]>(atom.arguments.arg5, ["CUSTOMER", "MERCHANT", "RE", "ESCROW_BANK", "THIRD_PARTY"], "UNKNOWN");
      const destinationCustody = enumValue<Account["custody"]>(atom.arguments.arg8, ["CUSTOMER", "MERCHANT", "RE", "ESCROW_BANK", "THIRD_PARTY"], "UNKNOWN");
      const mechanism = enumValue<MoneyEdge["mechanism"]>(atom.arguments.arg2, ["DIRECT_BANK_TRANSFER", "INTERNAL_LEDGER_TRANSFER", "ESCROW", "EXTERNAL_API_ROUTING", "POOL_PASS_THROUGH"], "UNKNOWN");
      addActor(sourceActorId, sourceType, atom);
      addActor(destinationActorId, destinationType, atom);
      addAccount(sourceAccountId, sourceActorId, sourceCustody, atom);
      addAccount(destinationAccountId, destinationActorId, destinationCustody, atom);
      merge(edges, {
        id: `edge:${sourceAccountId}:${destinationAccountId}`,
        label: "Partner X transfer",
        sourceAccountId,
        destinationAccountId,
        mechanism,
        ...provenance([atom]),
      });
    }
  }

  const builder = new ActivityGraphBuilder();
  [...actors.values()].forEach((actor) => builder.addActor(actor));
  [...accounts.values()].forEach((account) => builder.addAccount(account));
  [...edges.values()].forEach((edge) => builder.addMoneyEdge(edge));
  [...obligations.values()].forEach((obligation) => builder.addObligation(obligation));
  return builder.build(commitSha, label);
}

function merge<T extends { id: string; evidenceIds: string[]; derivation: Actor["derivation"]; hasUnverifiedEvidence: boolean }>(map: Map<string, T>, next: T): void {
  const existing = map.get(next.id);
  if (!existing) { map.set(next.id, next); return; }
  const evidenceIds = [...new Set([...existing.evidenceIds, ...next.evidenceIds])].sort();
  const allAi = existing.derivation === "AI_INFERRED" && next.derivation === "AI_INFERRED";
  const allDeterministic = existing.derivation === "DETERMINISTIC" && next.derivation === "DETERMINISTIC";
  map.set(next.id, { ...existing, evidenceIds, derivation: allAi ? "AI_INFERRED" : allDeterministic ? "DETERMINISTIC" : "MIXED", hasUnverifiedEvidence: existing.hasUnverifiedEvidence || next.hasUnverifiedEvidence });
}

function provenance(atoms: EvidenceAtom[]) {
  const allDeterministic = atoms.every((atom) => atom.derivation === "DETERMINISTIC_ADAPTER");
  const allAi = atoms.every((atom) => atom.derivation === "AI_INFERRED");
  return {
    evidenceIds: atoms.map((atom) => atom.id).sort(),
    derivation: allDeterministic ? "DETERMINISTIC" as const : allAi ? "AI_INFERRED" as const : "MIXED" as const,
    hasUnverifiedEvidence: atoms.some((atom) => atom.derivation === "AI_INFERRED" && atom.confidence === "UNCERTAIN"),
  };
}

function stringValue(atom: EvidenceAtom, key: string, role: string): string {
  const value = atom.arguments[key];
  return value?.type === "LITERAL" && typeof value.value === "string"
    ? value.value
    : `unknown:${atom.id}:${role}`;
}
function positiveNumber(value: EvidenceAtom["arguments"][string]): number | undefined {
  return value?.type === "LITERAL" && typeof value.value === "number" && Number.isInteger(value.value) && value.value > 0 ? value.value : undefined;
}
function nonNegativeNumber(value: EvidenceAtom["arguments"][string]): number | undefined {
  return value?.type === "LITERAL" && typeof value.value === "number" && Number.isInteger(value.value) && value.value >= 0 ? value.value : undefined;
}
function enumValue<T extends string>(value: EvidenceAtom["arguments"][string], allowed: readonly T[], fallback: T): T {
  return value?.type === "LITERAL" && typeof value.value === "string" && (allowed as readonly string[]).includes(value.value) ? value.value as T : fallback;
}
