# Changelog

## 0.1.0 — unreleased

First release.

### `jp-address-romaji`

- `toRomaji(address, options?)` — Japanese address to romanized, western-order address. Options for
  long-vowel style (`none` / `macron` / `circumflex` / `oh`), word order, country suffix, postal-code
  placement, capitalization, and whether the building name is rendered.
- `fromRomaji(address, options?)` — the reverse. Resolves outside-in (prefecture, municipality,
  town) and returns `AMBIGUOUS` with candidates rather than picking one. An optional
  `postalCodeIndex` hook lets a caller's own postal data narrow an ambiguity; no postal dataset is
  bundled.
- `parse(address)` — detects the script and returns a structured address either way.
- `toFormat(parsed, target)` — Google libaddressinput, Shopify and Stripe address shapes.
- Failures are returned as typed values, never thrown, so callers are forced to handle them.
- Runs entirely offline. The upstream normalizer defaults to a hosted API; this package always
  points it at a local directory and fails with `DATA_NOT_CONFIGURED` rather than falling back to
  the network. Enforced by a test that replaces `fetch` with a throwing stub.

### `jp-address-romaji-data`

- The offline dataset: 638,567 town entries across 1,899 municipalities.
- `build` CLI to regenerate or refresh it from upstream.
- Town-level coordinates and street-level records are excluded; see the package README for why.

### Notes on the data

Coverage is 99.55% nationally and 99.99% for chome-bearing urban addresses. Romaji and kana do not
go missing together: 89.51% of entries carry a romaji field but 99.55% carry a kana reading, so
roughly one entry in ten is romanized by transliterating its kana.

Kyoto street-name addresses (`烏丸通四条上ル笋町`) are supported. The street phrase is separated
before normalization — mandatory, since street names carry the same kanji numerals as chome and the
normalizer otherwise reads `四条` as chome 4 — and preserved verbatim on `parsed.kyotoStreet`. It is
not romanized, because the dataset has no readings for street names.

Not supported, each an explicit failure rather than a wrong answer: geocoding accuracy and
building-name translation. `fromRomaji` reads western order only.
