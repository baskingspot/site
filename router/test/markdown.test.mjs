import assert from "node:assert/strict";
import { test } from "node:test";

import {
  archiveLocation,
  discoveryLink,
  markdownTwin,
  prefersMarkdown,
  quality,
  versionArchive,
} from "../src/index.mjs";

const accept = (value) =>
  new Request("https://baskingspot.dev/stdx/", { headers: { accept: value } });

test("a directory page's twin is index.md, with or without the trailing slash", () => {
  assert.equal(markdownTwin("/stdx/"), "/stdx/index.md");
  assert.equal(markdownTwin("/stdx"), "/stdx/index.md");
  assert.equal(markdownTwin("/stdx/guide/"), "/stdx/guide/index.md");
  assert.equal(markdownTwin("/"), "/index.md");
});

test("a file has no twin", () => {
  assert.equal(markdownTwin("/stdx/style.css"), undefined);
  assert.equal(markdownTwin("/favicon.svg"), undefined);
  assert.equal(markdownTwin("/stdx/social.png"), undefined);
});

test("a media type's q-value is read, and defaults to 1", () => {
  assert.equal(quality("text/markdown", "text/markdown"), 1);
  assert.equal(quality("text/markdown;q=0.5", "text/markdown"), 0.5);
  assert.equal(quality("text/markdown;charset=utf-8", "text/markdown"), 1);
  assert.equal(quality("text/html, text/markdown;q=0", "text/markdown"), 0);
  assert.equal(quality("text/html", "text/markdown"), undefined);
  assert.equal(quality(undefined, "text/markdown"), undefined);
});

test("an agent that asks for markdown gets it", () => {
  assert.equal(prefersMarkdown(accept("text/markdown")), true);
  assert.equal(prefersMarkdown(accept("text/markdown, text/html, */*")), true);
  assert.equal(prefersMarkdown(accept("text/markdown;q=0.9, text/html;q=0.8")), true);
});

test("equal quality goes to whichever was listed first", () => {
  assert.equal(prefersMarkdown(accept("text/markdown, text/html")), true);
  assert.equal(prefersMarkdown(accept("text/html, text/markdown")), false);
});

test("a browser or curl does not", () => {
  assert.equal(
    prefersMarkdown(accept("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")),
    false,
  );
  assert.equal(prefersMarkdown(accept("*/*")), false);
  assert.equal(prefersMarkdown(accept(undefined)), false);
});

test("a client that prefers html over markdown gets html", () => {
  assert.equal(prefersMarkdown(accept("text/html, text/markdown;q=0.9")), false);
  assert.equal(prefersMarkdown(accept("text/markdown;q=0")), false);
});

test("a page advertises its twin and the index that covers it", () => {
  assert.equal(
    discoveryLink("/stdx/", "/stdx/index.md"),
    '</stdx/index.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"',
  );
});

test("a page with no twin still points at the index", () => {
  assert.equal(discoveryLink("/stdx/style.css", undefined), '</llms.txt>; rel="describedby"');
});

test("a version path names the tag archive", () => {
  assert.deepEqual(versionArchive("/cli/v0.1.0"), { slug: "cli", version: "0.1.0" });
  assert.deepEqual(versionArchive("/zig-benchmark/v12.0.3"), {
    slug: "zig-benchmark",
    version: "12.0.3",
  });
  assert.equal(versionArchive("/cli/v0.1"), undefined);
  assert.equal(versionArchive("/cli/v0.1.0/"), undefined);
  assert.equal(versionArchive("/cli/"), undefined);
  assert.equal(versionArchive("/"), undefined);
});

test("the archive redirect is resolved through GitHub", async () => {
  const codeload = "https://codeload.github.com/baskingspot/cli/tar.gz/refs/tags/v0.1.0";
  const fetcher = async (url, options) => {
    assert.equal(url, "https://github.com/baskingspot/cli/archive/refs/tags/v0.1.0.tar.gz");
    assert.equal(options.redirect, "manual");
    return new Response(null, { status: 302, headers: { location: codeload } });
  };
  assert.equal(await archiveLocation("cli", "0.1.0", fetcher), codeload);
});

test("a missing or foreign location falls back to the documented URL", async () => {
  const documented = "https://github.com/baskingspot/cli/archive/refs/tags/v0.1.0.tar.gz";
  assert.equal(
    await archiveLocation("cli", "0.1.0", async () => new Response(null, { status: 302 })),
    documented,
  );
  assert.equal(
    await archiveLocation(
      "cli",
      "0.1.0",
      async () =>
        new Response(null, { status: 302, headers: { location: "https://elsewhere.test/x" } }),
    ),
    documented,
  );
  assert.equal(
    await archiveLocation("cli", "0.1.0", async () => {
      throw new Error("offline");
    }),
    documented,
  );
});
