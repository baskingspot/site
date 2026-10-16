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
