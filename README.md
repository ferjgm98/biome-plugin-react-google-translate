# biome-plugin-react-google-translate

Biome/GritQL lint coverage for high-risk React text-node patterns that can break or become stale when Google Translate mutates DOM text nodes.

Google Translate can replace text nodes with elements while React still expects to own the original text node. This package catches structurally detectable React patterns where text is conditionally inserted, removed, or updated next to siblings.

This is inspired by [`eslint-plugin-react-google-translate`](https://github.com/getcouped/eslint-plugin-react-google-translate), but it is a Biome plugin package, not an ESLint dependency or a full port.

## Installation

```sh
pnpm add -D @biomejs/biome biome-plugin-react-google-translate
```

## Usage

Add the GritQL rule file to `biome.json`:

```json
{
  "plugins": [
    "./node_modules/biome-plugin-react-google-translate/rules/react-google-translate.grit"
  ]
}
```

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

Direct returns of strings, numbers, or template literals:

```jsx
export function Label({ value }) {
  if (value === 1) {
    return "Ready";
  }

  return `Value ${value}`;
}
```

Prefer wrapping text in an element:

```jsx
<p>
  {enabled ? <span>yes</span> : <span>no</span>}
  <span>status</span>
</p>
```

## Verification

```sh
pnpm install
pnpm verify
```

`pnpm verify` runs Biome against `fixtures/valid` and `fixtures/invalid`. It passes only when valid fixtures produce no diagnostics and invalid fixtures produce the expected plugin diagnostics.

## Fixtures

- `fixtures/invalid`: patterns this package currently catches.
- `fixtures/valid`: safe wrapping patterns that should stay clean.

## Limitations

Biome GritQL plugins are structural. This package does not use TypeScript type information, control-flow analysis, or React component-name inference.

Known gaps:

- Static JSX text after a conditional JSX expression is detected for the common direct-child shape where the text before the expression is whitespace-only and the text after it is meaningful content. More complex child lists may need additional GritQL variants.
- Calls are detected by visible callee shape only: `t(...)`, `formatMessage(...)`, `.toString()`, and `.toLocaleString()`. Aliased helpers, custom formatters, variables typed as `string` or `number`, and object properties are not type-resolved.
- Direct text return detection is file-structural. Scope Biome to React component files to avoid reporting ordinary utility functions that intentionally return strings or numbers.
- The diagnostic span is usually the parent JSX element for sibling hazards because Biome/GritQL plugin diagnostics operate on structural matches rather than ESLint-style visitor state.

## Comparison With eslint-plugin-react-google-translate

`eslint-plugin-react-google-translate` provides ESLint rules and can use TypeScript parser services when available. That lets it catch some typed variables and return values that do not have an obvious syntax shape.

This package is narrower:

- It runs through Biome's plugin mechanism.
- It ships a plain `.grit` rule file.
- It avoids ESLint and TypeScript parser-service dependencies.
- It only claims patterns that are verified in fixtures.

Use the ESLint plugin if you need the broader type-aware behavior today. Use this package when you want lightweight Biome-native coverage for the highest-signal React text-node hazards.

## Publishing

Before publishing:

```sh
pnpm verify
npm publish --access public
```

If publishing under a scope, update `package.json` `name`, repository URLs, and the install examples first.

## License

MIT
