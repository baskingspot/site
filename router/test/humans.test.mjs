import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const humans = readFileSync(new URL("../static/humans.txt", import.meta.url), "utf8");

test("humans.txt is plain ASCII, so it renders the same everywhere", () => {
  assert.doesNotMatch(humans, /[^\x00-\x7f]/);
});

test("humans.txt is a screenful: under 60 lines and 80 columns", () => {
  const lines = humans.split("\n");
  assert.ok(lines.length < 60, `${lines.length} lines`);
  for (const line of lines) assert.ok(line.length <= 80, `too wide: ${line}`);
});

test("humans.txt says how the site is made, and points at the disclosure", () => {
  assert.match(humans, /Built with LLM assistance/);
  assert.match(humans, /baskingspot\/\.github\/blob\/main\/docs\/AI\.md/);
});
