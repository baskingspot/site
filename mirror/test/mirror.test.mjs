import assert from "node:assert/strict";
import { test } from "node:test";

import worker, { download, mirrorList, originPath, pickMirror } from "../src/index.mjs";

/** A stand-in for caches.default that records what it is asked to store. */
function fakeCache() {
  const store = new Map();
  return {
    store,
    default: {
      async match(key) {
        return store.get(key.url);
      },
      async put(key, response) {
        store.set(key.url, response);
      },
    },
  };
}

const ctx = () => {
  const pending = [];
  return { pending, waitUntil: (promise) => pending.push(promise) };
};

test("a release file comes from the version directory", () => {
  assert.equal(
    originPath("zig-x86_64-linux-0.16.0.tar.xz"),
    "/download/0.16.0/zig-x86_64-linux-0.16.0.tar.xz",
  );
  assert.equal(originPath("zig-0.16.0.tar.xz"), "/download/0.16.0/zig-0.16.0.tar.xz");
  assert.equal(
    originPath("zig-bootstrap-0.16.0.tar.xz"),
    "/download/0.16.0/zig-bootstrap-0.16.0.tar.xz",
  );
  assert.equal(
    originPath("zig-linux-x86_64-0.13.0.tar.xz"),
    "/download/0.13.0/zig-linux-x86_64-0.13.0.tar.xz",
  );
});

test("a development build comes from builds, and a signature is its own file", () => {
  assert.equal(
    originPath("zig-x86_64-linux-0.17.0-dev.1234+abcdef012.tar.xz"),
    "/builds/zig-x86_64-linux-0.17.0-dev.1234+abcdef012.tar.xz",
  );
  assert.equal(
    originPath("zig-x86_64-linux-0.16.0.tar.xz.minisig"),
    "/download/0.16.0/zig-x86_64-linux-0.16.0.tar.xz.minisig",
  );
  assert.equal(
    originPath("zig-x86_64-windows-0.16.0.zip"),
    "/download/0.16.0/zig-x86_64-windows-0.16.0.zip",
  );
});

test("a name that is not a Zig tarball is not served", () => {
  for (const name of [
    "",
    "index.json",
    "zig-0.16.0.txt",
    "../etc/passwd",
    "zig-x86_64-linux-latest.tar.xz",
  ]) {
    assert.equal(originPath(name), undefined, name);
  }
});

test("the mirror list is read line by line", async () => {
  const fetcher = async () =>
    new Response("https://a.example/zig\n\nhttp://plain.example\nhttps://b.example\n");
  assert.deepEqual(await mirrorList(fetcher), ["https://a.example/zig", "https://b.example"]);
});

test("an unreadable mirror list falls back to the canonical site", async () => {
  const failing = async () => new Response("", { status: 503 });
  assert.deepEqual(await mirrorList(failing), ["https://ziglang.org"]);
  const offline = async () => {
    throw new Error("offline");
  };
  assert.deepEqual(await mirrorList(offline), ["https://ziglang.org"]);
});

test("the mirror is picked across the whole list", () => {
  const mirrors = ["a", "b", "c"];
  assert.equal(
    pickMirror(mirrors, () => 0),
    "a",
  );
  assert.equal(
    pickMirror(mirrors, () => 0.5),
    "b",
  );
  assert.equal(
    pickMirror(mirrors, () => 0.999),
    "c",
  );
});

test("a failed mirror hands the request to the next one", async () => {
  const tried = [];
  const values = [0, 0.9, 0.1];
  let index = 0;
  const random = () => values[index++ % values.length];
  const fetcher = async (url) => {
    if (url === "https://ziglang.org/download/community-mirrors.txt") {
      return new Response("https://a.example\nhttps://b.example\n");
    }
    tried.push(url);
    return url.startsWith("https://b.example")
      ? new Response("tarball", { status: 200 })
      : new Response("", { status: 503 });
  };
  const response = await download("/download/0.16.0/zig-x86_64-linux-0.16.0.tar.xz", {
    fetcher,
    random,
  });
  assert.equal(response.status, 200);
  assert.ok(tried.length >= 2, tried);
  assert.ok(tried.every((url) => url.endsWith("?source=baskingspot.dev")));
});

test("a 404 is only reported when every upstream is missing the file", async () => {
  const fetcher = async (url) => {
    if (url === "https://ziglang.org/download/community-mirrors.txt")
      return new Response("https://a.example\n");
    return new Response("", { status: 404 });
  };
  assert.equal((await download("/download/0.16.0/nope.tar.xz", { fetcher })).status, 404);
});

test("an upstream that cannot be reached is a 504", async () => {
  const fetcher = async (url) => {
    if (url === "https://ziglang.org/download/community-mirrors.txt")
      return new Response("https://a.example\n");
    throw new Error("offline");
  };
  const response = await download("/download/0.16.0/zig-x86_64-linux-0.16.0.tar.xz", { fetcher });
  assert.equal(response.status, 504);
});

test("a hit is served from the edge cache and never reaches a mirror", async () => {
  const cache = fakeCache();
  globalThis.caches = cache;
  let fetched = 0;
  const real = globalThis.fetch;
  globalThis.fetch = async () => {
    fetched += 1;
    return new Response("tarball");
  };
  const key = new Request("https://zig.baskingspot.dev/zig-x86_64-linux-0.16.0.tar.xz");
  cache.store.set(key.url, new Response("cached"));
  try {
    const response = await worker.fetch(
      new Request("https://zig.baskingspot.dev/zig-x86_64-linux-0.16.0.tar.xz?source=test"),
      {},
      ctx(),
    );
    assert.equal(await response.text(), "cached");
    assert.equal(response.headers.get("x-cache"), "hit");
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = real;
    delete globalThis.caches;
  }
});

test("a miss is fetched and stored under the path alone", async () => {
  const cache = fakeCache();
  globalThis.caches = cache;
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url === "https://ziglang.org/download/community-mirrors.txt")
      return new Response("https://a.example\n");
    return new Response("tarball", { headers: { "content-type": "application/x-xz" } });
  };
  try {
    const context = ctx();
    const response = await worker.fetch(
      new Request("https://zig.baskingspot.dev/zig-x86_64-linux-0.16.0.tar.xz?source=test"),
      {},
      context,
    );
    assert.equal(await response.text(), "tarball");
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(response.headers.get("x-cache"), "miss");
    await Promise.all(context.pending);
    assert.ok(cache.store.has("https://zig.baskingspot.dev/zig-x86_64-linux-0.16.0.tar.xz"));
  } finally {
    globalThis.fetch = real;
    delete globalThis.caches;
  }
});

test("a range request goes straight through and is not stored", async () => {
  const cache = fakeCache();
  globalThis.caches = cache;
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url === "https://ziglang.org/download/community-mirrors.txt")
      return new Response("https://a.example\n");
    return new Response("tarball", { status: 200 });
  };
  try {
    const context = ctx();
    await worker.fetch(
      new Request("https://zig.baskingspot.dev/zig-x86_64-linux-0.16.0.tar.xz", {
        headers: { range: "bytes=0-9" },
      }),
      {},
      context,
    );
    assert.equal(context.pending.length, 0);
    assert.equal(cache.store.size, 0);
  } finally {
    globalThis.fetch = real;
    delete globalThis.caches;
  }
});

test("a name that is not a tarball never reaches a mirror", async () => {
  const response = await worker.fetch(
    new Request("https://zig.baskingspot.dev/index.json"),
    {},
    ctx(),
  );
  assert.equal(response.status, 404);
});
