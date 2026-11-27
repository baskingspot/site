import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  collectSections,
  renderCountSummary,
  renderIndexMarkdown,
  renderLlmsTxt,
  renderRailNav,
  renderSecurityTxt,
  renderSitemap,
  renderSites,
  renderSkills,
} from "../build.mjs";

const lib = (description, group) =>
  group === undefined ? { kind: "library", description } : { kind: "library", description, group };
const tool = (description) => ({ kind: "tool", description });
const skill = (name) => ({
  name,
  url: `https://github.com/baskingspot/skills/tree/main/skills/${name}`,
  description: `${name} desc.`,
});

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

test("llms.txt has the h1, the summary blockquote, and one list per kind", () => {
  const text = renderLlmsTxt({ stdx: lib("stdx desc."), zigdoc: tool("docs.") });
  assert.match(text, /^# baskingspot\n/);
  assert.match(text, /^> Zig is cold-blooded\. Come bask\./m);
  assert.match(text, /^## Libraries$/m);
  assert.match(text, /^## Tools$/m);
  assert.match(text, /^- \[stdx\]\(https:\/\/baskingspot\.dev\/stdx\/\): stdx desc\.$/m);
  assert.match(text, /^## Optional$/m);
  assert.ok(text.indexOf("## Libraries") < text.indexOf("## Tools"));
});

test("llms.txt teaches the markdown twin rule in its prose", () => {
  const text = renderLlmsTxt({ stdx: lib("std.") });
  assert.match(text, /\/stdx\/` is/);
  assert.match(text, /Accept: text\/markdown/);
});

test("llms.txt has no section for an empty kind", () => {
  const text = renderLlmsTxt({ stdx: lib("std.") });
  assert.doesNotMatch(text, /## Tools/);
});

test("the front page has a markdown twin with the same roster", () => {
  const text = renderIndexMarkdown({ stdx: lib("std.") });
  assert.match(text, /^# baskingspot\n/);
  assert.match(text, /\[stdx\]\(https:\/\/baskingspot\.dev\/stdx\/\)/);
  assert.match(text, /llms\.txt/);
});

test("llms.txt lists the skills between the roster and Optional", () => {
  const text = renderLlmsTxt({ stdx: lib("std.") }, [skill("zig-016")]);
  assert.match(text, /^## Skills$/m);
  assert.match(text, /^- \[zig-016\]\(https:\/\/github\.com\/baskingspot\/skills/m);
  assert.ok(text.indexOf("## Libraries") < text.indexOf("## Skills"));
  assert.ok(text.indexOf("## Skills") < text.indexOf("## Optional"));
});

test("llms.txt has no skills section when the org ships none", () => {
  const text = renderLlmsTxt({ stdx: lib("std.") });
  assert.doesNotMatch(text, /## Skills/);
});

test("the landing page gives the skills their own section", () => {
  const html = renderSkills([skill("zig-016"), skill("tiger-style")]);
  assert.match(html, /<h2>Agent skills<\/h2>/);
  assert.match(html, /href="https:\/\/github\.com\/baskingspot\/skills/);
  assert.ok(
    html.indexOf('href="https://github.com/baskingspot/skills/tree/main/skills/zig-016"') <
      html.indexOf("tiger-style"),
  );
});

test("the landing page has no skills section when the org ships none", () => {
  assert.equal(renderSkills([]), "");
});

test("grouped libraries render in LIBRARY_GROUPS order before tools", () => {
  const html = renderSites({
    utf: lib("utf.", "text"),
    http: lib("http.", "network"),
    stdx: lib("stdx.", "core"),
    toml: lib("toml.", "formats"),
    zigdoc: tool("docs."),
  });
  const order = ["Core", "Networking", "Formats &amp; codecs", "Text", "Tools"];
  const positions = order.map((title) => html.indexOf(`<h2>${title}</h2>`));
  for (let i = 0; i < positions.length; i++) {
    assert.ok(positions[i] >= 0, `missing section ${order[i]}`);
    if (i > 0)
      assert.ok(positions[i - 1] < positions[i], `${order[i - 1]} must precede ${order[i]}`);
  }
});

test("group validation rejects unknown groups, tools with groups, and partial grouping", () => {
  assert.throws(() => renderSites({ x: lib("x.", "bogus") }), /x has group "bogus"/);
  assert.throws(
    () => renderSites({ x: { kind: "tool", description: "x.", group: "core" } }),
    /only libraries take a group/,
  );
  assert.throws(() => renderSites({ a: lib("a.", "core"), b: lib("b.") }), /b has no group/);
});

test("the rail nav nests library groups under Libraries with counts", () => {
  const sections = collectSections(
    { stdx: lib("stdx.", "core"), utf: lib("utf.", "text"), zigdoc: tool("docs.") },
    [skill("zig-017")],
  );
  const nav = renderRailNav(sections);
  assert.match(nav, /<span>Libraries<\/span><span class="toc-count">2<\/span>/);
  assert.match(nav, /href="#core"><span>Core<\/span><span class="toc-count">1<\/span>/);
  assert.match(nav, /href="#text"><span>Text<\/span><span class="toc-count">1<\/span>/);
  assert.match(nav, /href="#tools"><span>Tools<\/span><span class="toc-count">1<\/span>/);
  assert.match(nav, /href="#skills"><span>Agent skills<\/span><span class="toc-count">1<\/span>/);
  assert.match(nav, /href="#agents"><span>For agents<\/span>/);
});

test("the summary count formats singular and plural cleanly", () => {
  assert.equal(
    renderCountSummary({ stdx: lib("a.", "core"), zigdoc: tool("b.") }, [skill("zig-017")]),
    "1 library, 1 tool, and 1 agent skill.",
  );
  assert.equal(
    renderCountSummary({ a: lib("a.", "core"), b: lib("b.", "text") }, []),
    "2 libraries.",
  );
});

test("every library in sites.json belongs to a known group", () => {
  const { sites } = JSON.parse(readFileSync(new URL("../../sites.json", import.meta.url), "utf8"));
  for (const [slug, site] of Object.entries(sites)) {
    if (site.kind === "library") {
      assert.ok(typeof site.group === "string" && site.group.length > 0, `${slug} has no group`);
    }
  }
  assert.doesNotThrow(() => collectSections(sites, []));
});
