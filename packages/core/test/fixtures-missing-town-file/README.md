# fixtures-missing-town-file

`ja.json` copied byte-for-byte from `../fixtures/data`, and **only one** of the
seven municipalities it lists (`ja/東京都/新宿区.json`).

That combination is the point. The index still names 東京都渋谷区 and the other
five, so those municipalities are real and resolvable; only the files holding
their towns are absent. Serving a subset of the dataset like this is a
configuration the package documents and recommends — `README.md`'s *In the
browser* says the full set is about 1,900 files "but a conversion fetches two,
so you can also publish only the municipalities you care about" — which makes a
missing town file normal operation rather than a corrupted install.

新宿区 is the one kept because a check that only proves a failure is half a
check: the same fixture has to show that an address the dataset *does* carry
still converts, or "everything fails" would pass too.

Used by two test files, for the two shapes the failure takes:

- `../missingTownFile.test.ts` — `dataDir`, where the read fails with `ENOENT`.
- `../missingTownFileEndpoint.test.ts` — an HTTP host serving this directory
  and answering `404` with an HTML error page, which the upstream normalizer
  hands to `JSON.parse`. That is the form the bug was reported in (issue #58);
  the demo at <https://tomatomerde.github.io/jp-address-romaji/> serves exactly
  this layout.

Both used to escape `toRomaji` as an uncaught exception while `fromRomaji`
answered the same situation with a typed `DATA_NOT_CONFIGURED`.

Kept as its own directory rather than copying all seven municipalities: the
complete copy came to 508 KB, twenty times the largest other fixture here, to
express "one file is missing". Only the index and the one file that has to
succeed are needed.
