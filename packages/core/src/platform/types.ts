/**
 * The only three things this library cannot do the same way everywhere.
 *
 * Everything else in the package — normalization, romanization, reverse
 * lookup, formatting — is plain JavaScript that runs unchanged in Node and in
 * a browser. What differs is how the address dataset is *reached*: Node reads
 * it from the filesystem and can locate the optional `jp-address-romaji-data`
 * package, while a browser can only fetch it over HTTP from an endpoint the
 * caller hosts.
 *
 * Those differences are collected here instead of being sprinkled through the
 * modules that need them, so that the browser build's module graph contains no
 * `node:` import at all — not even a lazy one a bundler would still try to
 * resolve. The implementation is chosen by the package entry point
 * (`index.ts` for Node, `index.browser.ts` for the `browser` export
 * condition); see `current.ts`.
 */

export interface Platform {
  /** Which implementation is installed. Used by tests and error messages. */
  readonly name: 'node' | 'browser';

  /**
   * Read a `file:` URL as text.
   *
   * Rejects when the file cannot be read, and resolves to `undefined` where
   * the runtime has no filesystem at all. Both outcomes degrade to the same
   * "no data available" result in the caller (`dataAccess.ts`), which is why
   * this may throw: the caller already treats a throw as absence.
   */
  readFileUrl(url: URL): Promise<string | undefined>;

  /**
   * Locate the optional companion data package, if it is installed.
   *
   * `undefined` where package resolution is not available (a browser), which
   * makes the library report `DATA_NOT_CONFIGURED` rather than guess.
   */
  resolveBundledDataDir(): string | undefined;

  /**
   * Turn a local dataset directory into the endpoint URL the dataset is read
   * from, or `undefined` where local directories cannot be read.
   */
  dataDirToEndpoint(dir: string): string | undefined;
}
