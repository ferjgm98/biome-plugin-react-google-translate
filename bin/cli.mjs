#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import generate from "@babel/generator";
import { parse } from "@babel/parser";

const DEFAULT_PATTERNS = ["**/*.{jsx,tsx}"];
const FIXABLE_EXTENSIONS = new Set([".jsx", ".tsx"]);
const IGNORED_DIRS = new Set([".git", "node_modules"]);

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

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegex(pattern) {
  let source = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*" && next === "*") {
      const afterGlobstar = pattern[index + 2];
      if (afterGlobstar === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    if (char === "{") {
      const end = pattern.indexOf("}", index + 1);
      if (end !== -1) {
        const options = pattern
          .slice(index + 1, end)
          .split(",")
          .map(escapeRegex)
          .join("|");
        source += `(?:${options})`;
        index = end;
        continue;
      }
    }

    source += escapeRegex(char);
  }

  return new RegExp(`${source}$`);
}

function hasGlobMagic(pattern) {
  return /[*?{]/.test(pattern);
}

function getGlobBase(pattern) {
  const normalized = normalizePath(pattern);
  const firstMagic = normalized.search(/[*?{]/);

  if (firstMagic === -1) {
    return normalized;
  }

  const slashBeforeMagic = normalized.lastIndexOf("/", firstMagic);
  return slashBeforeMagic === -1 ? "." : normalized.slice(0, slashBeforeMagic);
}

function collectReactFiles(root) {
  const files = [];

  function visit(directory) {
    let entries;

    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          visit(entryPath);
        }
        continue;
      }

      if (entry.isFile() && FIXABLE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(entryPath);
      }
    }
  }

  visit(root);
  return files;
}

function expandPattern(pattern) {
  const absolutePattern = path.resolve(pattern);

  if (!hasGlobMagic(pattern)) {
    if (!fs.existsSync(absolutePattern)) {
      return [];
    }

    const stat = fs.statSync(absolutePattern);
    if (stat.isDirectory()) {
      return collectReactFiles(absolutePattern);
    }

    return stat.isFile() &&
      FIXABLE_EXTENSIONS.has(path.extname(absolutePattern))
      ? [absolutePattern]
      : [];
  }

  const root = path.resolve(getGlobBase(pattern));
  const matcher = globToRegex(normalizePath(absolutePattern));
  return collectReactFiles(root).filter((filePath) =>
    matcher.test(normalizePath(path.resolve(filePath))),
  );
}

function expandPatterns(patterns) {
  const seen = new Set();
  const files = [];

  for (const pattern of patterns) {
    for (const filePath of expandPattern(pattern)) {
      const relativePath = path.relative(process.cwd(), filePath) || filePath;

      if (!seen.has(relativePath)) {
        seen.add(relativePath);
        files.push(relativePath);
      }
    }
  }

  return files;
}

function isNode(node, type) {
  return node?.type === type;
}

function isWhitespaceJsxText(node) {
  return isNode(node, "JSXText") && node.value.trim() === "";
}

function isMeaningfulJsxChild(node) {
  return !isWhitespaceJsxText(node);
}

function hasMeaningfulSibling(node, parent) {
  if (!isNode(parent, "JSXElement")) {
    return false;
  }

  const meaningfulChildren = parent.children.filter(isMeaningfulJsxChild);
  return meaningfulChildren.some((child) => child !== node);
}

function isNamedCall(node, names) {
  return (
    isNode(node, "CallExpression") &&
    isNode(node.callee, "Identifier") &&
    names.has(node.callee.name) &&
    node.arguments.length > 0
  );
}

function isStringMethodCall(node) {
  return (
    isNode(node, "CallExpression") &&
    isNode(node.callee, "MemberExpression") &&
    isNode(node.callee.property, "Identifier") &&
    (node.callee.property.name === "toString" ||
      node.callee.property.name === "toLocaleString")
  );
}

function isMemberLike(node) {
  return (
    isNode(node, "MemberExpression") ||
    isNode(node, "OptionalMemberExpression") ||
    (isNode(node, "TSNonNullExpression") && isMemberLike(node.expression))
  );
}

function isStringProducingExpression(node) {
  return (
    isNode(node, "StringLiteral") ||
    isNode(node, "NumericLiteral") ||
    isNode(node, "TemplateLiteral") ||
    isNamedCall(node, new Set(["t", "formatMessage"])) ||
    isStringMethodCall(node) ||
    isMemberLike(node)
  );
}

function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}

function jsxIdentifier(name) {
  return { name, type: "JSXIdentifier" };
}

function jsxText(value) {
  return { type: "JSXText", value };
}

function jsxExpressionContainer(expression) {
  return { expression, type: "JSXExpressionContainer" };
}

function spanElement(children) {
  return {
    children,
    closingElement: {
      name: jsxIdentifier("span"),
      type: "JSXClosingElement",
    },
    openingElement: {
      attributes: [],
      name: jsxIdentifier("span"),
      selfClosing: false,
      type: "JSXOpeningElement",
    },
    type: "JSXElement",
  };
}

function jsxTextFromStringLiteral(node) {
  return jsxText(node.value);
}

function wrapExpression(node) {
  const child = isNode(node, "StringLiteral")
    ? jsxTextFromStringLiteral(node)
    : jsxExpressionContainer(cloneNode(node));

  return spanElement([child]);
}

function wrapIfNeeded(node) {
  if (!isStringProducingExpression(node) || isNode(node, "JSXElement")) {
    return node;
  }

  return wrapExpression(node);
}

function isConditionalExpressionContainer(node) {
  return (
    isNode(node, "JSXExpressionContainer") &&
    (isNode(node.expression, "ConditionalExpression") ||
      isNode(node.expression, "LogicalExpression"))
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

  const wrapped = spanElement([jsxText(parts.text.trim())]);

  return [jsxText(parts.before), wrapped, jsxText(parts.after)].filter(
    (child) => !isNode(child, "JSXText") || child.value !== "",
  );
}

function fixSource(source, filePath) {
  const ast = parseSource(source, filePath);
  let changed = false;

  walkAst(ast, null, false, (node, parent, inCapitalizedFunction) => {
    if (isNode(node, "JSXExpressionContainer")) {
      if (hasMeaningfulSibling(node, parent)) {
        const expression = node.expression;

        if (isNode(expression, "ConditionalExpression")) {
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
          isNode(expression, "LogicalExpression") &&
          expression.operator === "&&" &&
          isStringProducingExpression(expression.right)
        ) {
          expression.right = wrapExpression(expression.right);
          changed = true;
        }
      }
    }

    if (isNode(node, "JSXElement")) {
      const children = node.children;
      const nextChildren = [];
      let sawConditionalSibling = false;

      for (const child of children) {
        if (
          isNode(child, "JSXText") &&
          sawConditionalSibling &&
          child.value.trim()
        ) {
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

      node.children = nextChildren;
    }

    if (isNode(node, "ReturnStatement")) {
      const argument = node.argument;
      if (
        argument &&
        (isNode(argument, "StringLiteral") ||
          isNode(argument, "NumericLiteral") ||
          isNode(argument, "TemplateLiteral")) &&
        inCapitalizedFunction
      ) {
        node.argument = wrapExpression(argument);
        changed = true;
      }
    }
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

function walkAst(node, parent, inCapitalizedFunction, visit) {
  if (!node || typeof node !== "object") {
    return;
  }

  const isFunction =
    isNode(node, "FunctionDeclaration") ||
    isNode(node, "FunctionExpression") ||
    isNode(node, "ArrowFunctionExpression");
  const nextInCapitalizedFunction = isFunction
    ? inCapitalizedFunction || isCapitalizedFunction(node, parent)
    : inCapitalizedFunction;

  visit(node, parent, nextInCapitalizedFunction);

  for (const [key, value] of Object.entries(node)) {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "range" ||
      key === "leadingComments" ||
      key === "trailingComments" ||
      key === "innerComments"
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const child of value) {
        if (child?.type) {
          walkAst(child, node, nextInCapitalizedFunction, visit);
        }
      }
      continue;
    }

    if (value?.type) {
      walkAst(value, node, nextInCapitalizedFunction, visit);
    }
  }
}

function isCapitalizedFunction(node, parent) {
  if (isNode(node, "FunctionDeclaration")) {
    const name = node.id?.name;
    return Boolean(name && name[0] === name[0].toUpperCase());
  }

  if (isNode(parent, "VariableDeclarator") && isNode(parent.id, "Identifier")) {
    const name = parent.id.name;
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

  const files = expandPatterns(patterns);

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
