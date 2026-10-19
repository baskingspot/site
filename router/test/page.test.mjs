import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const headers = readFileSync(new URL("../static/_headers", import.meta.url), "utf8");
const css = readFileSync(new URL("../static/style.css", import.meta.url), "utf8");

test("the agent prompt has a copy button pointing at it", () => {
  const id = html.match(/data-copy="([\w-]+)"/)?.[1];
  assert.ok(id, "no data-copy attribute");
  assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<script src="\/copy\.js" defer><\/script>/);
});

test("the prompt wraps instead of scrolling sideways", () => {
  assert.match(css, /\.prompt pre \{[^}]*white-space: pre-wrap/s);
});

test("the front page's policy allows the script it loads", () => {
  // An inline script would be blocked by default-src 'none', so the page uses
  // one file and the policy names the origin it comes from.
  assert.match(headers, /script-src 'self'/);
  assert.match(headers, /style-src 'self'/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /\son[a-z]+="/);
  assert.doesNotMatch(html, /<style>|style="/);
});
