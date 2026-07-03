#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";
import generate from "@babel/generator";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import fg from "fast-glob";

const DEFAULT_PATTERNS = ["**/*.{jsx,tsx}"];

function printUsage() {
  console.log(`Usage:
  biome-plugin-react-google-translate fix [patterns...] [--write] [--no-format]
  react-google-translate-fix [patterns...] [--write] [--no-format]

Examples:
  pnpm dlx biome-plugin-react-google-translate fix "src/**/*.{jsx,tsx}" --write
  npx biome-plugin-react-google-translate fix src --write
  bunx biome-plugin-react-google-translate fix "app/**/*.tsx" --write

Without --write, the command reports files that would change. With --write,
changed files are formatted with Biome when a Biome binary is available.`);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args[0] === "fix" ? args.shift() : "fix";
  const write = args.includes("--write");
  const format = !args.includes("--no-format");
  const help = args.includes("--help") || args.includes("-h");
  const patterns = args.filter(
    (arg) => arg !== "--write" && arg !== "--no-format",
  );

  return {
    command,
    format,
    help,
    patterns: patterns.length > 0 ? patterns : DEFAULT_PATTERNS,
    write,
  };
}

function parseSource(source, filePath) {
  return parse(source, {
    sourceFilename: filePath,
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });
}

function isWhitespaceJsxText(node) {
  return t.isJSXText(node) && node.value.trim() === "";
}

function isMeaningfulJsxChild(node) {
  return !isWhitespaceJsxText(node);
}

function hasMeaningfulSibling(path) {
  const parent = path.parentPath;

  if (!parent?.isJSXElement()) {
    return false;
  }

  const meaningfulChildren = parent.node.children.filter(isMeaningfulJsxChild);
  return meaningfulChildren.some((child) => child !== path.node);
}

function isNamedCall(node, names) {
  return (
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee) &&
    names.has(node.callee.name) &&
    node.arguments.length > 0
  );
}

function isStringMethodCall(node) {
  return (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property) &&
    (node.callee.property.name === "toString" ||
      node.callee.property.name === "toLocaleString")
  );
}

function isMemberLike(node) {
  return (
    t.isMemberExpression(node) ||
    t.isOptionalMemberExpression?.(node) ||
    (t.isTSNonNullExpression(node) && isMemberLike(node.expression))
  );
}

function isStringProducingExpression(node) {
  return (
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isTemplateLiteral(node) ||
    isNamedCall(node, new Set(["t", "formatMessage"])) ||
    isStringMethodCall(node) ||
    isMemberLike(node)
  );
}

function jsxTextFromStringLiteral(node) {
  return t.jsxText(node.value);
}

function wrapExpression(node) {
  const child = t.isStringLiteral(node)
    ? jsxTextFromStringLiteral(node)
    : t.jsxExpressionContainer(t.cloneNode(node, true));

  return t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier("span"), []),
    t.jsxClosingElement(t.jsxIdentifier("span")),
    [child],
  );
}

function wrapIfNeeded(node) {
  if (!isStringProducingExpression(node) || t.isJSXElement(node)) {
    return node;
  }

  return wrapExpression(node);
}

function isConditionalExpressionContainer(node) {
  return (
    t.isJSXExpressionContainer(node) &&
    (t.isConditionalExpression(node.expression) ||
      t.isLogicalExpression(node.expression))
  );
}

function splitMeaningfulJsxText(node) {
  const value = node.value;
  const first = value.search(/\S/);

  if (first === -1) {
    return null;
  }

  let last = value.length - 1;
  while (last >= first && /\s/.test(value[last])) {
    last -= 1;
  }

  return {
    after: value.slice(last + 1),
    before: value.slice(0, first),
    text: value.slice(first, last + 1),
  };
}

function buildWrappedTextNodes(node) {
  const parts = splitMeaningfulJsxText(node);

  if (!parts) {
    return [node];
  }

  const wrapped = t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier("span"), []),
    t.jsxClosingElement(t.jsxIdentifier("span")),
    [t.jsxText(parts.text.trim())],
  );

  return [t.jsxText(parts.before), wrapped, t.jsxText(parts.after)].filter(
    (child) => !t.isJSXText(child) || child.value !== "",
  );
}

function fixSource(source, filePath) {
  const ast = parseSource(source, filePath);
  let changed = false;

  traverse(ast, {
    JSXExpressionContainer(path) {
      if (!hasMeaningfulSibling(path)) {
        return;
      }

      const expression = path.node.expression;

      if (t.isConditionalExpression(expression)) {
        const nextConsequent = wrapIfNeeded(expression.consequent);
        const nextAlternate = wrapIfNeeded(expression.alternate);

        if (
          nextConsequent !== expression.consequent ||
          nextAlternate !== expression.alternate
        ) {
          expression.consequent = nextConsequent;
          expression.alternate = nextAlternate;
          changed = true;
        }
      }

      if (
        t.isLogicalExpression(expression) &&
        expression.operator === "&&" &&
        isStringProducingExpression(expression.right)
      ) {
        expression.right = wrapExpression(expression.right);
        changed = true;
      }
    },
    JSXElement(path) {
      const children = path.node.children;
      const nextChildren = [];
      let sawConditionalSibling = false;

      for (const child of children) {
        if (t.isJSXText(child) && sawConditionalSibling && child.value.trim()) {
          nextChildren.push(...buildWrappedTextNodes(child));
          changed = true;
          continue;
        }

        nextChildren.push(child);

        if (isConditionalExpressionContainer(child)) {
          sawConditionalSibling = true;
        } else if (isMeaningfulJsxChild(child)) {
          sawConditionalSibling = false;
        }
      }

      path.node.children = nextChildren;
    },
    ReturnStatement(path) {
      const argument = path.node.argument;

      if (
        argument &&
        (t.isStringLiteral(argument) ||
          t.isNumericLiteral(argument) ||
          t.isTemplateLiteral(argument)) &&
        isInsideCapitalizedFunction(path)
      ) {
        path.node.argument = wrapExpression(argument);
        changed = true;
      }
    },
  });

  if (!changed) {
    return { changed: false, source };
  }

  return {
    changed: true,
    source: generate(ast, {
      jsescOption: { minimal: true },
    }).code,
  };
}

function isInsideCapitalizedFunction(path) {
  const functionPath = path.findParent(
    (parentPath) =>
      parentPath.isFunctionDeclaration() ||
      parentPath.isFunctionExpression() ||
      parentPath.isArrowFunctionExpression(),
  );

  if (!functionPath) {
    return false;
  }

  if (functionPath.isFunctionDeclaration()) {
    const name = functionPath.node.id?.name;
    return Boolean(name && name[0] === name[0].toUpperCase());
  }

  const parent = functionPath.parentPath;
  if (parent?.isVariableDeclarator() && t.isIdentifier(parent.node.id)) {
    const name = parent.node.id.name;
    return name[0] === name[0].toUpperCase();
  }

  return false;
}

async function run() {
  const { command, format, help, patterns, write } = parseArgs(
    process.argv.slice(2),
  );

  if (help) {
    printUsage();
    return;
  }

  if (command !== "fix") {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const files = await fg(patterns, {
    absolute: false,
    dot: false,
    onlyFiles: true,
    unique: true,
  });

  let changedCount = 0;
  const changedFiles = [];

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    const result = fixSource(source, filePath);

    if (!result.changed) {
      continue;
    }

    changedCount += 1;
    changedFiles.push(filePath);

    if (write) {
      fs.writeFileSync(filePath, `${result.source}\n`);
      console.log(`fixed ${filePath}`);
    } else {
      console.log(`would fix ${filePath}`);
    }
  }

  if (!write && changedCount > 0) {
    console.log(`Run again with --write to update ${changedCount} file(s).`);
  }

  if (write && format && changedFiles.length > 0) {
    formatWithBiome(changedFiles);
  }

  if (changedCount === 0) {
    console.log("No fixable React Google Translate text-node hazards found.");
  }
}

function formatWithBiome(files) {
  const localBiome = "node_modules/.bin/biome";
  const biomeCommand = fs.existsSync(localBiome) ? localBiome : "biome";
  const result = spawnSync(biomeCommand, ["format", "--write", ...files], {
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error) {
    console.warn(
      "Skipped formatting changed files because Biome was not available. Run your formatter after this command.",
    );
    return;
  }

  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    console.warn("Biome formatting reported errors after fixes.");
    return;
  }

  console.log(`formatted ${files.length} file(s) with Biome`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
