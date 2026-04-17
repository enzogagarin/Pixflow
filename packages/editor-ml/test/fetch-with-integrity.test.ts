import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWithIntegrity,
  MODEL_CACHE_NAME,
  ModelFetchError,
  ModelIntegrityError,
  sha256Hex,
  type ModelSpec,
} from '../src/loader/index.js';

/**
 * In-memory CacheStorage mock. Only implements the methods fetch-with-
 * integrity actually uses; anything else throws so we catch accidental
 * reliance on unimplemented surface.
 */
function makeCacheStorage(): {
  storage: CacheStorage;
  bucket: (name: string) => Map<string, Response>;
} {
  const buckets = new Map<string, Map<string, Response>>();
  const getBucket = (name: string): Map<string, Response> => {
    let b = buckets.get(name);
    if (!b) {
      b = new Map<string, Response>();
      buckets.set(name, b);
    }
    return b;
  };
  const storage = {
    open: async (name: string): Promise<Cache> => {
      const bucket = getBucket(name);
      return {
        match: async (req: RequestInfo | URL): Promise<Response | undefined> => {
          const key = typeof req === 'string' ? req : String(req);
          const stored = bucket.get(key);
          return stored ? stored.clone() : undefined;
        },
        put: async (req: RequestInfo | URL, resp: Response): Promise<void> => {
          const key = typeof req === 'string' ? req : String(req);
          bucket.set(key, resp);
        },
        delete: async (req: RequestInfo | URL): Promise<boolean> => {
          const key = typeof req === 'string' ? req : String(req);
          return bucket.delete(key);
        },
      } as unknown as Cache;
    },
    // Unused methods — intentionally stubbed to surface accidental calls.
    has: async () => false,
    keys: async () => [],
    match: async () => undefined,
    delete: async () => false,
  } as unknown as CacheStorage;
  return { storage, bucket: getBucket };
}

const URL_A = 'https://editor.example/models/blazeface.onnx';

async function specFor(content: string): Promise<{ spec: ModelSpec; buf: ArrayBuffer }> {
  const buf = new TextEncoder().encode(content).buffer as ArrayBuffer;
  const sha256 = await sha256Hex(buf);
  return {
    spec: { url: URL_A, sha256, size: buf.byteLength },
    buf,
  };
}

describe('sha256Hex', () => {
  it('returns the empty-string digest for an empty buffer', async () => {
    const hash = await sha256Hex(new ArrayBuffer(0));
    // Well-known digest of the empty byte string.
    expect(hash).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('returns a known digest for "abc"', async () => {
    const buf = new TextEncoder().encode('abc').buffer as ArrayBuffer;
    const hash = await sha256Hex(buf);
    expect(hash).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('fetchWithIntegrity', () => {
  let cacheDeps: ReturnType<typeof makeCacheStorage>;

  beforeEach(() => {
    cacheDeps = makeCacheStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cache miss: fetches, verifies, caches, and returns the bytes', async () => {
    const { spec, buf } = await specFor('hello world');
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(buf.slice(0), { status: 200 }));

    const result = await fetchWithIntegrity(spec, {
      cacheStorage: cacheDeps.storage,
      fetchFn,
    });

    expect(new Uint8Array(result)).toEqual(new Uint8Array(buf));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // Second call should hit cache and not re-fetch.
    const stored = cacheDeps.bucket(MODEL_CACHE_NAME).get(spec.url);
    expect(stored).toBeDefined();
  });

  it('cache hit (integrity pass): returns cached bytes without calling fetch', async () => {
    const { spec, buf } = await specFor('cached content');
    cacheDeps.bucket(MODEL_CACHE_NAME).set(spec.url, new Response(buf.slice(0)));
    const fetchFn = vi.fn<typeof fetch>();

    const result = await fetchWithIntegrity(spec, {
      cacheStorage: cacheDeps.storage,
      fetchFn,
    });

    expect(new Uint8Array(result)).toEqual(new Uint8Array(buf));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('cache hit with wrong hash: evicts and re-fetches', async () => {
    const { spec, buf: rightBuf } = await specFor('right content');
    const wrongBuf = new TextEncoder().encode('wrong content').buffer as ArrayBuffer;
    cacheDeps.bucket(MODEL_CACHE_NAME).set(spec.url, new Response(wrongBuf));
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(rightBuf.slice(0), { status: 200 }));

    const result = await fetchWithIntegrity(spec, {
      cacheStorage: cacheDeps.storage,
      fetchFn,
    });

    expect(new Uint8Array(result)).toEqual(new Uint8Array(rightBuf));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const stored = cacheDeps.bucket(MODEL_CACHE_NAME).get(spec.url);
    expect(stored).toBeDefined();
  });

  it('throws ModelIntegrityError when fetched bytes hash to something else', async () => {
    const { spec } = await specFor('expected content');
    const wrongBuf = new TextEncoder().encode('attacker payload').buffer as ArrayBuffer;
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(wrongBuf.slice(0), { status: 200 }));

    await expect(
      fetchWithIntegrity(spec, {
        cacheStorage: cacheDeps.storage,
        fetchFn,
      }),
    ).rejects.toBeInstanceOf(ModelIntegrityError);
    // Integrity failure on a network fetch must NOT write to cache.
    expect(cacheDeps.bucket(MODEL_CACHE_NAME).has(spec.url)).toBe(false);
  });

  it('throws ModelIntegrityError when byte size differs from spec.size', async () => {
    const content = 'size-mismatch-payload';
    const buf = new TextEncoder().encode(content).buffer as ArrayBuffer;
    const actualSha = await sha256Hex(buf);
    // Claim the spec says 999 bytes while the real payload is only ~21.
    const spec: ModelSpec = { url: URL_A, sha256: actualSha, size: 999 };
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(buf.slice(0), { status: 200 }));

    await expect(
      fetchWithIntegrity(spec, {
        cacheStorage: cacheDeps.storage,
        fetchFn,
      }),
    ).rejects.toBeInstanceOf(ModelIntegrityError);
  });

  it('throws ModelFetchError on non-2xx response with status populated', async () => {
    const { spec } = await specFor('anything');
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('not found', { status: 404 }));

    try {
      await fetchWithIntegrity(spec, {
        cacheStorage: cacheDeps.storage,
        fetchFn,
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ModelFetchError);
      expect((err as ModelFetchError).status).toBe(404);
    }
  });

  it('throws ModelFetchError when fetch itself rejects (network/abort)', async () => {
    const { spec } = await specFor('anything');
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('network down'));

    await expect(
      fetchWithIntegrity(spec, {
        cacheStorage: cacheDeps.storage,
        fetchFn,
      }),
    ).rejects.toBeInstanceOf(ModelFetchError);
  });

  it('passes AbortSignal through to the underlying fetch', async () => {
    const { spec, buf } = await specFor('signal-passthrough');
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(buf.slice(0), { status: 200 }));
    const ctrl = new AbortController();

    await fetchWithIntegrity(spec, {
      cacheStorage: cacheDeps.storage,
      fetchFn,
      signal: ctrl.signal,
    });

    const [, init] = fetchFn.mock.calls[0] ?? [];
    expect(init?.signal).toBe(ctrl.signal);
  });

  it('throws ModelFetchError if CacheStorage is unavailable', async () => {
    const { spec } = await specFor('whatever');
    const fetchFn = vi.fn<typeof fetch>();

    await expect(
      fetchWithIntegrity(spec, {
        cacheStorage: undefined as unknown as CacheStorage,
        fetchFn,
      }),
    ).rejects.toBeInstanceOf(ModelFetchError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
