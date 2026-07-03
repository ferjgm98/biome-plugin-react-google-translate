# Contributing

Thanks for helping improve `biome-plugin-react-google-translate`.

## Development

Install dependencies:

```sh
pnpm install
```

Run the fixture verification:

```sh
pnpm verify
```

## Rule Changes

When changing `rules/react-google-translate.grit`, add or update fixtures in both `fixtures/valid` and `fixtures/invalid` where possible. Keep the rules structural and document any cases that need type information or control-flow analysis.

## Release Checklist

1. Run `pnpm verify`.
2. Update `README.md` if behavior or limitations changed.
3. Confirm `package.json` metadata is correct.
4. Publish with `npm publish --access public` after tagging the release.
