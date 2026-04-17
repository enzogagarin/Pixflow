import {
  ModelFetchError,
  ModelIntegrityError,
  type FetchWithIntegrityOptions,
  type ModelSpec,
} from './types.js';

/** Cache bucket name. Bump to `-v2` to force-evict old cached models. */
export const MODEL_CACHE_NAME = 'pixflow-models-v1';

/**
 * Fetch a model asset, verifying its SHA-256 against the spec before returning.
 * Cache-first: on cache hit, re-verify the cached bytes (protects against
 * cache corruption); on mismatch, evict and re-fetch. After a successful
 * network fetch, the bytes are stored in the Cache API for next time.
 *
 * The caller supplies `cacheStorage` and `fetchFn` for testing; defaults read
 * from `globalThis`, which is where browsers put them. In Node (tests), we
 * always inject to avoid relying on undici's ambient caches.
 */
export async function fetchWithIntegrity(
  spec: ModelSpec,
  options: FetchWithIntegrityOptions = {},
): Promise<ArrayBuffer> {
  const cacheStorage = options.cacheStorage ?? globalThis.caches;
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  if (!cacheStorage) {
    throw new ModelFetchError(spec.url, 'CacheStorage unavailable in this environment');
  }
  if (!fetchFn) {
    throw new ModelFetchError(spec.url, 'fetch unavailable in this environment');
  }

  const cache = await cacheStorage.open(MODEL_CACHE_NAME);

  const cached = await cache.match(spec.url);
  if (cached) {
    const buf = await cached.arrayBuffer();
    if (buf.byteLength === spec.size && (await sha256Hex(buf)) === spec.sha256) {
      return buf;
    }
    // Corrupt cache entry. Delete and fall through to re-fetch.
    await cache.delete(spec.url);
  }

  let resp: Response;
  try {
    const init: RequestInit = { cache: 'force-cache' };
    if (options.signal) init.signal = options.signal;
    resp = await fetchFn(spec.url, init);
  } catch (err) {
    throw new ModelFetchError(
      spec.url,
      err instanceof Error ? err.message : String(err),
    );
  }
  if (!resp.ok) {
    throw new ModelFetchError(spec.url, `HTTP ${String(resp.status)}`, resp.status);
  }

  const buf = await resp.arrayBuffer();
  if (buf.byteLength !== spec.size) {
    throw new ModelIntegrityError(
      spec.url,
      `${String(spec.size)} bytes`,
      `${String(buf.byteLength)} bytes`,
    );
  }
  const actual = await sha256Hex(buf);
  if (actual !== spec.sha256) {
    throw new ModelIntegrityError(spec.url, spec.sha256, actual);
  }

  // Store a fresh Response so the body is not consumed on read-back.
  // Cloning resp here would work too but slice() is explicit about the copy.
  await cache.put(
    spec.url,
    new Response(buf.slice(0), { headers: resp.headers }),
  );
  return buf;
}

/** SHA-256 of an ArrayBuffer as lowercase hex. Uses WebCrypto (`crypto.subtle`). */
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
