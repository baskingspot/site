import assert from "node:assert/strict";
import { test } from "node:test";

import { renderSecurityTxt, renderSitemap, renderSites } from "../build.mjs";

const lib = (description) => ({ kind: "library", description });
const tool = (description) => ({ kind: "tool", description });

test("a site becomes a link to its prefix, in roster order", () => {
  const html = renderSites({ stdx: lib("std."), zeta: lib("z.") });
  assert.ok(html.indexOf('href="/stdx/"') < html.indexOf('href="/zeta/"'));
  assert.match(html, /<p>std\.<\/p>/);
});

test("libraries and tools are separate sections, libraries first", () => {
  const html = renderSites({ zigdoc: tool("docs."), stdx: lib("std.") });
  assert.ok(html.indexOf("<h2>Libraries</h2>") < html.indexOf("<h2>Tools</h2>"));
  const [libraries, tools] = html.split("<h2>Tools</h2>");
  assert.match(libraries, /href="\/stdx\/"/);
  assert.doesNotMatch(libraries, /zigdoc/);
  assert.match(tools, /href="\/zigdoc\/"/);
});

test("a kind with no sites gets no section", () => {
  const onlyLibraries = renderSites({ stdx: lib("std.") });
  assert.match(onlyLibraries, /<h2>Libraries<\/h2>/);
  assert.doesNotMatch(onlyLibraries, /Tools/);
  const onlyTools = renderSites({ zigdoc: tool("docs.") });
  assert.doesNotMatch(onlyTools, /Libraries/);
  assert.equal(renderSites({}), "");
});

test("an unknown or missing kind is an error, not a hidden site", () => {
  assert.throws(
    () => renderSites({ x: { kind: "toool", description: "x" } }),
    /x has kind "toool"/,
  );
  assert.throws(() => renderSites({ x: { description: "x" } }), /x has kind undefined/);
});

test("a description cannot inject markup", () => {
  assert.doesNotMatch(renderSites({ x: lib("<script>") }), /<script>/);
});

test("the sitemap lists the front page and each site, escaped as XML needs", () => {
  const xml = renderSitemap({ stdx: lib("std."), "zig-benchmark": tool("bench.") });
  assert.match(xml, /<loc>https:\/\/baskingspot\.dev\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/baskingspot\.dev\/stdx\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/baskingspot\.dev\/zig-benchmark\/<\/loc>/);
  assert.match(xml, /^<\?xml/);
});

test("security.txt has a contact, an expiry a year out, and a canonical URL", () => {
  const text = renderSecurityTxt(new Date("2026-10-17T12:34:56.789Z"));
  assert.match(
    text,
    /^Contact: https:\/\/github\.com\/baskingspot\/\.github\/security\/advisories\/new$/m,
  );
  assert.match(text, /^Expires: 2027-10-17T12:34:56Z$/m);
  assert.match(text, /^Canonical: https:\/\/baskingspot\.dev\/\.well-known\/security\.txt$/m);
  assert.ok(text.endsWith("\n"));
});
