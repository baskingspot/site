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

test("an agent that asks for markdown gets the twin, said to be markdown", async () => {
  const seen = [];
  const env = {
    SITE_STDX: {
      fetch: async (request) => {
        seen.push(new URL(request.url).pathname);
        if (new URL(request.url).pathname === "/stdx/index.md") {
          return new Response("# stdx\n", { headers: { "content-length": "8" } });
        }
        return new Response("<h1>stdx</h1>", { headers: { "content-type": "text/html" } });
      },
    },
  };
  const res = await router.fetch(
    new Request("https://baskingspot.dev/stdx/", { headers: { accept: "text/markdown" } }),
    env,
  );
  assert.deepEqual(seen, ["/stdx/index.md"]);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/markdown/);
  assert.equal(res.headers.get("vary"), "accept");
  assert.match(res.headers.get("x-robots-tag"), /noindex/);
  assert.match(res.headers.get("link"), /rel="alternate"; type="text\/markdown"/);
  assert.equal(res.headers.get("x-markdown-tokens"), "2");
  assert.equal(await res.text(), "# stdx\n");
});

test("a browser gets the page, and it advertises the twin", async () => {
  const seen = [];
  const env = {
    SITE_STDX: {
      fetch: async (request) => {
        seen.push(new URL(request.url).pathname);
        return new Response("<h1>stdx</h1>", { headers: { "content-type": "text/html" } });
      },
    },
  };
  const res = await router.fetch(
    new Request("https://baskingspot.dev/stdx/", { headers: { accept: "text/html" } }),
    env,
  );
  assert.deepEqual(seen, ["/stdx/"]);
  assert.match(res.headers.get("content-type"), /^text\/html/);
  assert.equal(res.headers.get("vary"), "accept");
  assert.match(res.headers.get("link"), /<\/stdx\/index\.md>/);
  assert.equal(res.headers.get("x-markdown-tokens"), null);
});

test("a page with no twin falls back to the html rather than a 404", async () => {
  const env = {
    SITE_STDX: {
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        if (path.endsWith(".md")) return new Response("missing\n", { status: 404 });
        return new Response("<h1>kept</h1>", { headers: { "content-type": "text/html" } });
      },
    },
  };
  const res = await router.fetch(
    new Request("https://baskingspot.dev/stdx/", { headers: { accept: "text/markdown" } }),
    env,
  );
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/html/);
  assert.equal(await res.text(), "<h1>kept</h1>");
});

test("the front page negotiates markdown from the assets binding", async () => {
  const seen = [];
  const env = {
    ASSETS: {
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        seen.push(path);
        return new Response(path === "/index.md" ? "# baskingspot\n" : "<h1>hi</h1>");
      },
    },
  };
  const md = await router.fetch(
    new Request("https://baskingspot.dev/", { headers: { accept: "text/markdown" } }),
    env,
  );
  assert.match(md.headers.get("content-type"), /^text\/markdown/);
  assert.match(md.headers.get("link"), /<\/index\.md>/);
  assert.equal(await md.text(), "# baskingspot\n");

  const html = await router.fetch(
    new Request("https://baskingspot.dev/", { headers: { accept: "text/html" } }),
    env,
  );
  assert.match(await html.text(), /<h1>hi<\/h1>/);
  assert.deepEqual(seen, ["/index.md", "/"]);
});

test("a direct fetch of a twin is marked noindex", async () => {
  const env = {
    SITE_STDX: {
      fetch: async () => new Response("# stdx\n", { headers: { "content-type": "text/markdown" } }),
    },
  };
  const res = await router.fetch(new Request("https://baskingspot.dev/stdx/index.md"), env);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("x-robots-tag"), /noindex/);
  assert.match(res.headers.get("link"), /<\/llms\.txt>/);
});

test("a direct fetch of the front page twin is served from assets, noindex", async () => {
  const env = { ASSETS: { fetch: async () => new Response("# baskingspot\n") } };
  const res = await router.fetch(new Request("https://baskingspot.dev/index.md"), env);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("x-robots-tag"), /noindex/);
  assert.match(res.headers.get("link"), /<\/index\.md>/);
});
