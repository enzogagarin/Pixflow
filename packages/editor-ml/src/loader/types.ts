/**
 * Spec for a pinned model asset: where to fetch it from, how large it is,
 * and the exact SHA-256 hash the bytes must match. The hash is a
 * compile-time constant — a build script computes it from the actual model
 * file and inlines it here before the package ships. A mismatch at runtime
 * means either (a) the cache is corrupt, or (b) the on-disk model was
 * swapped (supply-chain attack) — both cases throw and the editor falls
 * back gracefully.
 */
export interface ModelSpec {
  /** Same-origin URL. Relative paths are not allowed — callers must resolve. */
  readonly url: string;
  /** Lowercase hex SHA-256 of the model bytes (no `0x`, no spaces). */
  readonly sha256: string;
  /** Expected byte length. Defence-in-depth: catches partial fetches that
   *  happen to hash to something short, before the full SHA check runs. */
  readonly size: number;
}

/** Thrown when cached or fetched model bytes do not match `spec.sha256`. */
export class ModelIntegrityError extends Error {
  readonly expected: string;
  readonly actual: string;
  constructor(url: string, expected: string, actual: string) {
    super(
      `Model integrity check failed for ${url}: expected SHA-256 ${expected}, got ${actual}`,
    );
    this.name = 'ModelIntegrityError';
    this.expected = expected;
    this.actual = actual;
  }
}

/** Thrown when the network fetch itself fails (non-2xx, network error, abort). */
export class ModelFetchError extends Error {
  readonly status: number | undefined;
  constructor(url: string, cause: string, status?: number) {
    super(`Model fetch failed for ${url}: ${cause}`);
    this.name = 'ModelFetchError';
    if (status !== undefined) this.status = status;
  }
}

export interface FetchWithIntegrityDeps {
  /** Override for tests. Defaults to globalThis.caches. */
  readonly cacheStorage?: CacheStorage;
  /** Override for tests. Defaults to globalThis.fetch. */
  readonly fetchFn?: typeof fetch;
}

export interface FetchWithIntegrityOptions extends FetchWithIntegrityDeps {
  readonly signal?: AbortSignal;
}
