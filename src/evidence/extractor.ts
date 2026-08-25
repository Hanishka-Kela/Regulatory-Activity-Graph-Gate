import { createHash } from "node:crypto";
import {
  CallExpression,
  Node,
  Project,
  SourceFile,
  SyntaxKind,
} from "ts-morph";
import type { EvidenceAtom, Value } from "./types.js";

export interface ExtractionOptions {
  commitSha: string;
  filePath?: string;
}

type KnownAdapter = {
  root: string;
  chain: readonly string[];
  modules: readonly string[];
  localTypes: readonly string[];
  symbol: string;
  operation: string;
};

const KNOWN_ADAPTERS: readonly KnownAdapter[] = [
  {
    root: "razorpayClient",
    chain: ["payments", "create"],
    modules: ["razorpay"],
    localTypes: ["RazorpayClient"],
    symbol: "razorpayClient.payments.create",
    operation: "payments.create",
  },
  {
    root: "partnerXClient",
    chain: ["credit", "createInstallmentPlan"],
    modules: ["partner-x-sdk"],
    localTypes: ["PartnerXClient"],
    symbol: "partnerXClient.credit.createInstallmentPlan",
    operation: "credit.createInstallmentPlan",
  },
  {
    root: "partnerXClient",
    chain: ["transfer"],
    modules: ["partner-x-sdk"],
    localTypes: ["PartnerXClient"],
    symbol: "partnerXClient.transfer",
    operation: "transfer",
  },
];

/** Parses one TypeScript file and returns only confidently resolved SDK calls. */
export function extractEvidenceFromFile(
  filePath: string,
  options: Omit<ExtractionOptions, "filePath">,
): EvidenceAtom[] {
  const project = new Project({ tsConfigFilePath: undefined, skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(filePath);
  return extractEvidenceFromSourceFile(sourceFile, { ...options, filePath });
}

/** Exported primarily for deterministic fixture tests using an in-memory source file. */
export function extractEvidenceFromSourceText(
  text: string,
  filePath: string,
  options: Omit<ExtractionOptions, "filePath">,
): EvidenceAtom[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile(filePath, text);
  return extractEvidenceFromSourceFile(sourceFile, { ...options, filePath });
}

function extractEvidenceFromSourceFile(sourceFile: SourceFile, options: ExtractionOptions): EvidenceAtom[] {
  const file = options.filePath ?? sourceFile.getFilePath();
  return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
    .flatMap((call) => {
      const adapter = findAdapter(call);
      return adapter && resolvesToExpectedClient(sourceFile, adapter)
        ? [toEvidenceAtom(call, adapter, options.commitSha, file)]
        : [];
    });
}

function findAdapter(call: CallExpression): KnownAdapter | undefined {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return undefined;

  const parts: string[] = [];
  let current: Node = expression;
  while (Node.isPropertyAccessExpression(current)) {
    parts.unshift(current.getName());
    current = current.getExpression();
  }
  if (!Node.isIdentifier(current)) return undefined;
  parts.unshift(current.getText());

  return KNOWN_ADAPTERS.find((adapter) =>
    parts[0] === adapter.root
    && parts.length === adapter.chain.length + 1
    && adapter.chain.every((part, index) => parts[index + 1] === part),
  );
}

function resolvesToExpectedClient(sourceFile: SourceFile, adapter: KnownAdapter): boolean {
  const declarations = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((identifier) => identifier.getText() === adapter.root)
    .flatMap((identifier) => identifier.getDefinitions())
    .map((definition) => definition.getDeclarationNode())
    .filter((node): node is Node => node !== undefined);

  return declarations.some((declaration) => {
    const importDeclaration = declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    if (importDeclaration && adapter.modules.includes(importDeclaration.getModuleSpecifierValue())) return true;

    const variable = declaration.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    const typeText = variable?.getTypeNode()?.getText();
    return typeText !== undefined && adapter.localTypes.includes(typeText);
  });
}

function toEvidenceAtom(
  call: CallExpression,
  adapter: KnownAdapter,
  commitSha: string,
  file: string,
): EvidenceAtom {
  const sourceFile = call.getSourceFile();
  const start = sourceFile.getLineAndColumnAtPos(call.getStart());
  const end = sourceFile.getLineAndColumnAtPos(call.getEnd());
  const span = {
    startLine: start.line,
    endLine: end.line,
    startColumn: start.column,
    endColumn: end.column,
  };
  const symbol = adapter.symbol;
  const id = createHash("sha256")
    .update(JSON.stringify([commitSha, file, span, symbol]), "utf8")
    .digest("hex");

  return {
    id,
    source: { commitSha, file, span },
    kind: "EXTERNAL_CALL",
    symbol,
    operation: adapter.operation,
    arguments: Object.fromEntries(call.getArguments().map((argument, index) => [
      `arg${index}`,
      extractValue(argument),
    ])),
    execution: {
      isInsideFunction: call.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) !== undefined
        || call.getFirstAncestorByKind(SyntaxKind.FunctionExpression) !== undefined
        || call.getFirstAncestorByKind(SyntaxKind.ArrowFunction) !== undefined,
      isReachableFromExportedHandler: isReachableFromExportedHandler(call),
      isAwaited: isDirectlyAwaited(call),
    },
    derivation: "DETERMINISTIC_ADAPTER",
    confidence: "SUPPORTED",
  };
}

function isDirectlyAwaited(call: CallExpression): boolean {
  const parent = call.getParent();
  return Node.isAwaitExpression(parent) && parent.getExpression() === call;
}

function extractValue(node: Node): Value {
  if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) {
    return { type: "LITERAL", value: Node.isNumericLiteral(node) ? Number(node.getText()) : node.getLiteralText() };
  }
  if (Node.isTrueLiteral(node)) return { type: "LITERAL", value: true };
  if (Node.isFalseLiteral(node)) return { type: "LITERAL", value: false };
  if (node.getKind() === SyntaxKind.NullKeyword) return { type: "LITERAL", value: null };
  if (Node.isIdentifier(node) || Node.isPropertyAccessExpression(node)) {
    return { type: "REFERENCE", expression: node.getText() };
  }
  return { type: "UNKNOWN", expression: node.getText() };
}

function isReachableFromExportedHandler(call: CallExpression): boolean {
  const containingFunction = call.getFirstAncestor((node) => Node.isFunctionDeclaration(node)
    || Node.isFunctionExpression(node) || Node.isArrowFunction(node));
  if (!containingFunction) return false;
  if (Node.isFunctionDeclaration(containingFunction) && containingFunction.isExported()) return true;
  if (!Node.isFunctionDeclaration(containingFunction)) return false;

  const name = containingFunction.getName();
  if (!name) return false;
  const sourceFile = call.getSourceFile();
  return sourceFile.getFunctions().some((fn) => fn.isExported()
    && fn.getDescendantsOfKind(SyntaxKind.CallExpression).some((candidate) => candidate.getExpression().getText() === name));
}
