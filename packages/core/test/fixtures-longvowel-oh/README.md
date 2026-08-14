# `longVowel: 'oh'` municipality-suffix regression fixture

A fourth, separate fixture dataset (same file layout as `../fixtures/data`),
kept apart from it for the same reason as the municipality-ambiguity and
chome-ambiguity fixtures: this one exists only to reproduce a specific real
bug, not to exercise general coverage.

One real municipality — 北海道石狩郡当別町 (`county_r` `"Ishikari-gun"`,
`city_r` `"Tobetsu-cho"`) — chosen because its kana reading for `町`
(チョウ, i.e. the `"cho"` reading, as opposed to `マチ`/`"machi"`) itself
contains a long vowel (o+u). That is what exposes the bug: `formatMunicipality`
(`packages/core/src/romaji/format.ts`) always renders the administrative
suffix as the literal, style-invariant string from its `SUFFIXES` table
(`cho`, never `choh`), but before the fix, `fromRomaji`'s `candidateKeys` /
`exactKeys` (`packages/core/src/fromRomaji.ts`) transliterated the *whole*
kana reading in one pass. Under `'oh'` style that renders 町's own チョウ as
`choh`, a spelling `formatMunicipality` never emits — so `fromRomaji` could
not read back `toRomaji`'s own `{ longVowel: 'oh' }` output for any
municipality whose suffix reading has a hidden long vowel this way (町 read
`cho`; roughly 53 municipalities nationwide).

No town-level file is needed: every test here supplies only the prefecture +
municipality segments, so `fromRomaji` returns before it would ever try to
load one (see the `remaining.length === 0` branch in `fromRomaji.ts`).

Regenerating: extract 北海道 and its 石狩郡当別町 entry from a real built
dataset (`JP_ADDRESS_ROMAJI_DATA_DIR`), the same way the other dedicated
fixture directories describe.
