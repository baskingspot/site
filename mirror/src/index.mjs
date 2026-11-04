// The Zig download mirror at zig.baskingspot.dev.
//
// It is a pull-through cache. A hit comes from the Cloudflare edge cache; a
// miss asks a random community mirror, so a cold start does not hammer any
// single one, and ziglang.org is the last resort. Every file is served exactly
// as the ZSF signed it, and clients verify the minisign signature themselves;
// the mirror is not a trust anchor.
//
// The file rules are MIRRORS.md's: a release comes from /download/<version>/,
// a development build from /builds/, and a name that is not a Zig tarball is a
// 404. If every upstream fails, the answer is 504, which tells the client the
// problem is the origin.

const MIRRORS_URL = "https://ziglang.org/download/community-mirrors.txt";
const CANONICAL = "https://ziglang.org";

/** The filename pattern from MIRRORS.md. The capture is the version. */
const FILENAME =
  /^zig(?:|-bootstrap|-[a-zA-Z0-9_]+-[a-zA-Z0-9_]+)-(\d+\.\d+\.\d+(?:-dev\.\d+\+[0-9a-f]+)?)\.(?:tar\.xz|zip)(?:\.minisig)?$/;

/** A year, because a versioned tarball never changes. */
const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * The ziglang.org path for a tarball file, or undefined when the name is not
 * one. The version decides the origin: a `-dev.` build lives under /builds/,
 * and a release under /download/<version>/.
 */
export function originPath(filename) {
  const match = FILENAME.exec(filename);
  if (match === null) return undefined;
  const version = match[1];
  return version.includes("-dev.") ? `/builds/${filename}` : `/download/${version}/${filename}`;
}

/**
 * The community mirror list, kept at the edge for a day. A failed fetch falls
 * back to the canonical site, which is still a valid place to pull from.
 */
export async function mirrorList(fetcher = fetch) {
  try {
    const response = await fetcher(MIRRORS_URL, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (response.ok) {
      const mirrors = (await response.text())
        .split("\n")
        .filter((line) => line.startsWith("https://"));
      if (mirrors.length > 0) return mirrors;
    }
  } catch {
    // Fall through to the canonical site.
  }
  return [CANONICAL];
}

/** One mirror, at random, so no single one takes every miss. */
export function pickMirror(mirrors, random = Math.random) {
  return mirrors[Math.floor(random() * mirrors.length)];
}

/**
 * A file from a random mirror, then another, then the canonical site. A 404 is
 * only returned when every upstream said 404; everything else that goes wrong
 * is 504, because the client's next move is to try a different mirror.
 */
export async function download(path, options = {}) {
  const { fetcher = fetch, random = Math.random, method = "GET", range } = options;
  const mirrors = await mirrorList(fetcher);
  const tries = [
    pickMirror(mirrors, random),
    pickMirror(mirrors, random),
    pickMirror(mirrors, random),
    CANONICAL,
  ];
  const init = range === undefined ? { method } : { method, headers: { range } };
  let missing = true;
  for (const base of tries) {
    try {
      const response = await fetcher(`${base}${path}?source=baskingspot.dev`, init);
      if (response.status === 200 || response.status === 206) return response;
      await response.body?.cancel();
      if (response.status !== 404) missing = false;
    } catch {
      missing = false;
    }
  }
  return new Response(missing ? "not found\n" : "the upstream mirrors did not answer\n", {
    status: missing ? 404 : 504,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const filename = url.pathname.slice(1);
    const path = originPath(filename);
    if (path === undefined) return new Response("not found\n", { status: 404 });

    // The key has no query string: `?source=` must not fragment the cache.
    const key = new Request(`https://zig.baskingspot.dev/${filename}`);
    const ranged = request.headers.has("range");
    const cacheable = request.method === "GET" && !ranged;
    if (cacheable) {
      const hit = await caches.default.match(key);
      if (hit !== undefined) {
        const headers = new Headers(hit.headers);
        headers.set("x-cache", "hit");
        return new Response(hit.body, { status: hit.status, headers });
      }
    }

    const response = await download(path, {
      method: request.method,
      range: request.headers.get("range") ?? undefined,
    });
    if (!cacheable || response.status !== 200) return response;

    const headers = new Headers(response.headers);
    headers.set("cache-control", IMMUTABLE);
    headers.set("x-cache", "miss");
    const out = new Response(response.body, { status: 200, headers });
    // The put consumes a clone, so the client is not delayed by the write.
    ctx.waitUntil(caches.default.put(key, out.clone()));
    return out;
  },
};
