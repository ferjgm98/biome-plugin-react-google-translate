# biome-plugin-react-google-translate

Biome/GritQL lint coverage for high-risk React text-node patterns that can break or become stale when Google Translate mutates DOM text nodes.

Google Translate can replace text nodes with elements while React still expects to own the original text node. This package catches structurally detectable React patterns where text is conditionally inserted, removed, or updated next to siblings.

This is inspired by [`eslint-plugin-react-google-translate`](https://github.com/getcouped/eslint-plugin-react-google-translate), but it is a Biome plugin package, not an ESLint dependency or a full port.

## Installation

```sh
pnpm add -D @biomejs/biome biome-plugin-react-google-translate
```

## Compatibility

This package requires Biome `2.5.2` or newer. Earlier Biome versions can fail to compile the GritQL plugin with a generic plugin-loading error because the plugin uses newer GritQL node-field and list-pattern support.

If your editor reports `The plugin loading has failed`, check the Biome version shown by the extension or run:

```sh
pnpm biome version
```

Then upgrade Biome:

```sh
pnpm add -D @biomejs/biome@latest
```

## Usage

Extend the Biome preset from `biome.json`:

```json
{
  "extends": ["biome-plugin-react-google-translate/biome/react"]
}
```

That preset enables the GritQL plugin for JSX and TSX files.

### Legacy Direct Plugin Path

The older direct `.grit` path remains supported:

```json
{
  "plugins": [
    "./node_modules/biome-plugin-react-google-translate/rules/react-google-translate.grit"
  ]
}
```

Use this form if you prefer explicit plugin loading or need compatibility with setups that do not use package-based `extends`.

Run Biome on React files:

```sh
pnpm biome lint "src/**/*.{jsx,tsx}"
```

You can also scope the plugin in Biome config if you only want it in React component directories:

```json
{
  "plugins": [
    {
      "path": "./node_modules/biome-plugin-react-google-translate/rules/react-google-translate.grit",
      "includes": ["src/**/*.{jsx,tsx}"]
    }
  ]
}
```

## What It Catches

Conditional JSX text with sibling elements:

```jsx
<p>
  {enabled ? "yes" : "no"}
  <span>status</span>
</p>
```

Logical JSX text with sibling elements:

```jsx
<p>
  {enabled && "active"}
  <span>status</span>
</p>
```

Common string-producing calls in conditional JSX when structurally visible:

```jsx
<p>
  {enabled ? t("yes") : <span>no</span>}
  <span>status</span>
</p>

<p>
  {enabled && value.toLocaleString()}
  <span>status</span>
</p>
```

Member and optional member expressions in conditional JSX:

```jsx
<p>
  {enabled && user?.label}
  <span>status</span>
</p>
```

Prefer wrapping text in an element:

```jsx
<p>
  {enabled ? <span>yes</span> : <span>no</span>}
  <span>status</span>
</p>
```

## Autofix

The package includes a conservative codemod command for the verified structural cases:

```sh
pnpm dlx biome-plugin-react-google-translate fix "src/**/*.{jsx,tsx}" --write
npx biome-plugin-react-google-translate fix "src/**/*.{jsx,tsx}" --write
bunx biome-plugin-react-google-translate fix "src/**/*.{jsx,tsx}" --write
```

The command defaults to dry-run mode:

```sh
pnpm dlx biome-plugin-react-google-translate fix "src/**/*.{jsx,tsx}"
```

With `--write`, it wraps fixable text-producing JSX branches in `<span>`. It also runs `biome format --write` on changed files when a Biome binary is available. Use `--no-format` to skip formatting.

## Verification

```sh
pnpm install
pnpm verify
```

`pnpm verify` runs Biome against `fixtures/valid` and `fixtures/invalid`. It passes only when valid fixtures produce no diagnostics and invalid fixtures produce the expected plugin diagnostics.

The verifier also runs the autofix command against a temporary copy of the invalid fixtures and confirms the fixed output has no remaining plugin diagnostics.

## Fixtures

- `fixtures/invalid`: patterns this package currently catches.
- `fixtures/valid`: safe wrapping patterns that should stay clean.

## Limitations

Biome GritQL plugins are structural. This package does not use TypeScript type information, control-flow analysis, or React component-name inference.

Known gaps:

- Static JSX text after a conditional JSX expression is detected for the common direct-child shape where the text before the expression is whitespace-only and the text after it is meaningful content. More complex child lists may need additional GritQL variants.
- Calls and member expressions are detected by visible syntax shape only: `t(...)`, `formatMessage(...)`, `.toString()`, `.toLocaleString()`, `obj.label`, and `obj?.label`. Aliased helpers, custom formatters, variables typed as `string` or `number`, and computed object properties are not type-resolved.
- The diagnostic span is usually the parent JSX element for sibling hazards because Biome/GritQL plugin diagnostics operate on structural matches rather than ESLint-style visitor state.
- Autofix is intentionally conservative and syntax-based. Review changes before committing, especially member-expression cases where type information is unavailable.

## Comparison With eslint-plugin-react-google-translate

`eslint-plugin-react-google-translate` provides ESLint rules and can use TypeScript parser services when available. That lets it catch some typed variables and return values that do not have an obvious syntax shape.

This package is narrower:

- It runs through Biome's plugin mechanism.
- It ships a plain `.grit` rule file.
- It avoids ESLint and TypeScript parser-service dependencies.
- It only claims patterns that are verified in fixtures.
- It adds an optional standalone codemod CLI for high-confidence fixes instead of relying on ESLint fixers.

Use the ESLint plugin if you need the broader type-aware behavior today. Use this package when you want lightweight Biome-native coverage for the highest-signal React text-node hazards.

## License

MIT
