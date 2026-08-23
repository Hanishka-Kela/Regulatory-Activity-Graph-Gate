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
    this.moneyEdges.push(edge);
    return this;
  }

  addObligation(obligation: Obligation): this {
    ObligationSchema.parse(obligation);
    if (this.obligationIds.has(obligation.id)) {
      throw new Error(`Duplicate obligation id: ${obligation.id}`);
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
