import assert from "node:assert/strict";
import { test } from "node:test";

import { renderSites } from "../build.mjs";

test("a site becomes a link to its prefix, in roster order", () => {
  const html = renderSites({ stdx: { description: "std." }, zeta: { description: "z." } });
  assert.ok(html.indexOf('href="/stdx/"') < html.indexOf('href="/zeta/"'));
  assert.match(html, /<p>std\.<\/p>/);
});

test("a description cannot inject markup", () => {
  assert.doesNotMatch(renderSites({ x: { description: "<script>" } }), /<script>/);
});
