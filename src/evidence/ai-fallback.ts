import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { Node, Project, SyntaxKind } from "ts-morph";
import { extractEvidenceFromFile } from "./extractor.js";
import type { EvidenceAtom, Value } from "./types.js";
import type { PolicyResult } from "../policy/types.js";

const ValueSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("LITERAL"), value: z.union([z.string(), z.number(), z.boolean(), z.null()]) }), z.object({ type: z.literal("REFERENCE"), expression: z.string() }), z.object({ type: z.literal("UNKNOWN"), expression: z.string() })]);
const ResponseSchema = z.object({ relevant: z.boolean(), symbol: z.string(), operation: z.string(), arguments: z.record(ValueSchema), confidence: z.enum(["SUPPORTED", "UNCERTAIN"]) }).strict();
const FINANCIAL_VERBS = /payment|pay|transfer|credit|loan|installment|route/i;
export type CandidateCall = { file: string; commitSha: string; text: string; symbol: string; span: EvidenceAtom["source"]["span"]; arguments: Record<string, Value>; execution: EvidenceAtom["execution"] };
export type FallbackOutcome = { atoms: EvidenceAtom[]; failsafe?: { policyId: "EXTRACTION_FAILSAFE"; severity: "REVIEW"; message: string; graphObjects: []; evidenceIds: [] } };

/** Candidate triage reuses Phase 3 output to exclude recognized adapters; verbs only prioritize unmatched AST calls for AI review. */
export function findSemanticCandidates(file: string, commitSha: string): CandidateCall[] {
  const knownStarts = new Set(extractEvidenceFromFile(file, { commitSha }).map((atom) => `${atom.source.span.startLine}:${atom.source.span.startColumn}`));
  const project = new Project({ tsConfigFilePath: undefined, skipAddingFilesFromTsConfig: true }); const source = project.addSourceFileAtPath(file);
  return source.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    const start = source.getLineAndColumnAtPos(call.getStart()); const end = source.getLineAndColumnAtPos(call.getEnd()); const key = `${start.line}:${start.column}`; const symbol = call.getExpression().getText();
    if (knownStarts.has(key) || !calledSegments(call.getExpression()).some((segment) => FINANCIAL_VERBS.test(segment))) return [];
    const args = Object.fromEntries(call.getArguments().map((arg, i) => [`arg${i}`, value(arg)]));
    return [{ file, commitSha, text: call.getText(), symbol, span: { startLine: start.line, startColumn: start.column, endLine: end.line, endColumn: end.column }, arguments: args, execution: { isInsideFunction: call.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) !== undefined || call.getFirstAncestorByKind(SyntaxKind.ArrowFunction) !== undefined, isReachableFromExportedHandler: true, isAwaited: Node.isAwaitExpression(call.getParent()) } }];
  });
}
function calledSegments(node: Node): string[] { const segments: string[] = []; let current = node; while (Node.isPropertyAccessExpression(current)) { segments.push(current.getName()); current = current.getExpression(); } if (Node.isIdentifier(current)) segments.push(current.getText()); return segments; }
export function replaySemanticResponse(candidate: CandidateCall, raw: unknown): FallbackOutcome {
  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) return failsafe("Semantic fallback returned schema-invalid output");
  if (!parsed.data.relevant) return { atoms: [] };
  const id = createHash("sha256").update(JSON.stringify([candidate.commitSha, candidate.file, candidate.span, parsed.data.symbol]), "utf8").digest("hex");
  return { atoms: [{ id, source: { commitSha: candidate.commitSha, file: candidate.file, span: candidate.span }, kind: "EXTERNAL_CALL", symbol: parsed.data.symbol, operation: parsed.data.operation, arguments: parsed.data.arguments, execution: candidate.execution, derivation: "AI_INFERRED", confidence: parsed.data.confidence }] };
}
/** Buildathon deviation: Gemini replaces the frozen OpenAI provider for cost reasons; tests use replaySemanticResponse. */
export async function extractLiveSemanticCandidate(candidate: CandidateCall, client?: GoogleGenAI): Promise<FallbackOutcome> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const activeClient = client ?? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await activeClient.models.generateContent({ model: "gemini-3.7-flash", contents: `Classify this candidate financial call. Return JSON only: ${candidate.text}`, config: { responseMimeType: "application/json" } });
      return replaySemanticResponse(candidate, JSON.parse(response.text ?? ""));
    } catch (error) {
      if (attempt === 1) return failsafe(`Semantic fallback unavailable after one retry: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return failsafe("Semantic fallback unavailable");
}
export function failsafe(message: string): FallbackOutcome { return { atoms: [], failsafe: { policyId: "EXTRACTION_FAILSAFE", severity: "REVIEW", message, graphObjects: [], evidenceIds: [] } }; }
/** Applies only extraction-shape failures after normal deterministic policy evaluation. */
export function applyExtractionFailsafe(result: PolicyResult, outcome: FallbackOutcome): PolicyResult {
  if (!outcome.failsafe || result.decision === "BLOCK") return result;
  return { ...result, decision: "REVIEW", violations: [...result.violations, outcome.failsafe] };
}
function value(node: Node): Value { if (Node.isStringLiteral(node)) return { type: "LITERAL", value: node.getLiteralText() }; if (Node.isNumericLiteral(node)) return { type: "LITERAL", value: Number(node.getText()) }; if (Node.isIdentifier(node) || Node.isPropertyAccessExpression(node)) return { type: "REFERENCE", expression: node.getText() }; return { type: "UNKNOWN", expression: node.getText() }; }
