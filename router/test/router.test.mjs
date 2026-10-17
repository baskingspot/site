import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import router, { bindingName, siteFor } from "../src/index.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

test("a slug maps to its binding name", () => {
  assert.equal(bindingName("stdx"), "SITE_STDX");
  assert.equal(bindingName("zig-benchmark"), "SITE_ZIG_BENCHMARK");
});

test("the first path segment picks the binding", () => {
  const env = { SITE_STDX: "stdx", SITE_ZIG_BENCHMARK: "bench" };
  assert.equal(siteFor(env, "/stdx/api/"), "stdx");
  assert.equal(siteFor(env, "/zig-benchmark"), "bench");
  assert.equal(siteFor(env, "/stdxfoo/"), undefined);
  assert.equal(siteFor(env, "/"), undefined);
});

test("a segment cannot reach an env key that is not a binding", () => {
  assert.equal(siteFor({ SITE_X: 1 }, "/constructor/"), undefined);
  assert.equal(siteFor({ SITE_X: 1 }, "/__proto__/"), undefined);
});

test("the router forwards the request unchanged and 404s the rest", async () => {
  const seen = [];
  const env = {
    SITE_STDX: { fetch: async (request) => (seen.push(request.url), new Response("ok")) },
  };
  const hit = await router.fetch(new Request("https://baskingspot.dev/stdx/api/"), env);
  assert.equal(hit.status, 200);
  assert.deepEqual(seen, ["https://baskingspot.dev/stdx/api/"]);
  const miss = await router.fetch(new Request("https://baskingspot.dev/nope"), env);
  assert.equal(miss.status, 404);
});

test("every slug in sites.json is a valid path segment", () => {
  for (const slug of Object.keys(read("../../sites.json").sites)) {
    assert.match(slug, /^[a-z0-9-]+$/);
  }
});

test("a request to no site is the branded 404, with a real 404 status", async () => {
  const res = await router.fetch(new Request("https://baskingspot.dev/nope"), {});
  assert.equal(res.status, 404);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(await res.text(), /Nothing is basking here/);
});

test("a HEAD request to no site gets the 404 headers and no body", async () => {
  const res = await router.fetch(
    new Request("https://baskingspot.dev/nope", { method: "HEAD" }),
    {},
  );
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "");
});

test("a site's own 404 is replaced by the branded page", async () => {
  const env = { SITE_STDX: { fetch: async () => new Response("plain 404\n", { status: 404 }) } };
  const res = await router.fetch(new Request("https://baskingspot.dev/stdx/missing"), env);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Nothing is basking here/);
});

test("a site's response gets the security headers, and keeps its own", async () => {
  const env = {
    SITE_STDX: {
      fetch: async () =>
        new Response("ok", { headers: { "referrer-policy": "no-referrer", "x-site": "kept" } }),
    },
  };
  const res = await router.fetch(new Request("https://baskingspot.dev/stdx/"), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.equal(res.headers.get("x-site"), "kept");
  assert.equal(await res.text(), "ok");
});

test("a redirect from a site passes through with its status and location", async () => {
  const env = {
    SITE_STDX: {
      fetch: async () => new Response(null, { status: 307, headers: { location: "/stdx/api/" } }),
    },
  };
  const res = await router.fetch(new Request("https://baskingspot.dev/stdx/api"), env);
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), "/stdx/api/");
});
