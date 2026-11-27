// Builds router/public/, the assets the router serves: the files in static/,
// index.html with one entry per site in sites.json, a sitemap of the same
// sites, and security.txt. Run by `just build`.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

const escapeHtml = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The kinds of sites in sites.json, in order. */
export const COLUMNS = [
  { kind: "library", title: "Libraries" },
  { kind: "tool", title: "Tools" },
];

/** Library groupings on the landing page, in display order. */
export const LIBRARY_GROUPS = [
  { id: "core", title: "Core" },
  { id: "network", title: "Networking" },
  { id: "formats", title: "Formats & codecs" },
  { id: "text", title: "Text" },
];

function validateSites(sites) {
  const knownKinds = new Set(COLUMNS.map((column) => column.kind));
  const knownGroups = new Set(LIBRARY_GROUPS.map((group) => group.id));
  for (const [slug, site] of Object.entries(sites)) {
    if (!knownKinds.has(site.kind)) {
      throw new Error(
        `sites.json: ${slug} has kind ${JSON.stringify(site.kind)}, want one of ${[...knownKinds].join(", ")}`,
      );
    }
    if (site.kind !== "library" && site.group !== undefined) {
      throw new Error(
        `sites.json: ${slug} has group ${JSON.stringify(site.group)}, only libraries take a group`,
      );
    }
    if (site.group !== undefined && !knownGroups.has(site.group)) {
      throw new Error(
        `sites.json: ${slug} has group ${JSON.stringify(site.group)}, want one of ${[...knownGroups].join(", ")}`,
      );
    }
  }
}

/** Collect all non-empty landing page sections in display order. */
export function collectSections(sites, skills = []) {
  validateSites(sites);
  const sections = [];

  const libraries = Object.entries(sites).filter(([, site]) => site.kind === "library");
  const hasGroups = libraries.some(([, site]) => site.group !== undefined);

  if (hasGroups) {
    const ungrouped = libraries.filter(([, site]) => site.group === undefined);
    if (ungrouped.length > 0) {
      throw new Error(
        `sites.json: ${ungrouped[0][0]} has no group, want one of ${LIBRARY_GROUPS.map((g) => g.id).join(", ")}`,
      );
    }
    for (const group of LIBRARY_GROUPS) {
      const entries = libraries.filter(([, site]) => site.group === group.id);
      if (entries.length === 0) continue;
      sections.push({
        id: group.id,
        kind: "library",
        title: group.title,
        entries: entries.map(([slug, site]) => ({
          name: slug,
          href: `/${slug}/`,
          description: site.description,
        })),
      });
    }
  } else if (libraries.length > 0) {
    sections.push({
      id: "libraries",
      kind: "library",
      title: "Libraries",
      entries: libraries.map(([slug, site]) => ({
        name: slug,
        href: `/${slug}/`,
        description: site.description,
      })),
    });
  }

  const tools = Object.entries(sites).filter(([, site]) => site.kind === "tool");
  if (tools.length > 0) {
    sections.push({
      id: "tools",
      kind: "tool",
      title: "Tools",
      entries: tools.map(([slug, site]) => ({
        name: slug,
        href: `/${slug}/`,
        description: site.description,
      })),
    });
  }

  if (skills.length > 0) {
    sections.push({
      id: "skills",
      kind: "skill",
      title: "Agent skills",
      note: "baskingspot/skills",
      entries: skills.map((skill) => ({
        name: skill.name,
        href: skill.url,
        description: skill.description,
      })),
    });
  }

  return sections;
}

function renderEntryList(entries) {
  return entries
    .map((entry) =>
      [
        "            <li>",
        `              <a class="entry" href="${escapeHtml(entry.href)}">`,
        `                <span class="entry-name">${escapeHtml(entry.name)}</span>`,
        `                <p>${escapeHtml(entry.description)}</p>`,
        "              </a>",
        "            </li>",
      ].join("\n"),
    )
    .join("\n");
}

function renderSection(section) {
  const meta = section.note
    ? `<span class="group-meta">${escapeHtml(section.note)}</span>`
    : `<span class="group-meta">${section.entries.length}</span>`;
  return [
    `        <section class="group" id="${escapeHtml(section.id)}">`,
    `          <div class="group-head"><h2>${escapeHtml(section.title)}</h2>${meta}</div>`,
    '          <ul class="entry-grid">',
    renderEntryList(section.entries),
    "          </ul>",
    "        </section>",
  ].join("\n");
}

/** Render the catalog sections for sites. */
export function renderSites(sites) {
  const sections = collectSections(sites, []);
  return sections.map((section) => renderSection(section)).join("\n");
}

/** Render the skills section on its own. */
export function renderSkills(skills) {
  if (skills.length === 0) return "";
  const [section] = collectSections({}, skills);
  return renderSection(section);
}

/**
 * Render the docs-style contents nav in the left rail: library groups nested
 * under Libraries (matching the docs theme's TOC hierarchy), followed by Tools,
 * Agent skills, and For agents.
 */
export function renderRailNav(sections) {
  const libSections = sections.filter((section) => section.kind === "library");
  const otherSections = sections.filter((section) => section.kind !== "library");
  const lines = [];

  if (libSections.length > 0) {
    const totalLibs = libSections.reduce((sum, section) => sum + section.entries.length, 0);
    lines.push('            <li class="toc-branch">');
    lines.push(
      `              <a class="toc-top" href="#${escapeHtml(libSections[0].id)}"><span>Libraries</span><span class="toc-count">${totalLibs}</span></a>`,
    );
    if (libSections.length > 1 || libSections[0].id !== "libraries") {
      lines.push("              <ul>");
      for (const section of libSections) {
        lines.push(
          `                <li><a href="#${escapeHtml(section.id)}"><span>${escapeHtml(section.title)}</span><span class="toc-count">${section.entries.length}</span></a></li>`,
        );
      }
      lines.push("              </ul>");
    }
    lines.push("            </li>");
  }

  for (const section of otherSections) {
    lines.push(
      `            <li><a class="toc-top" href="#${escapeHtml(section.id)}"><span>${escapeHtml(section.title)}</span><span class="toc-count">${section.entries.length}</span></a></li>`,
    );
  }

  lines.push('            <li><a class="toc-top" href="#agents"><span>For agents</span></a></li>');
  return lines.join("\n");
}

/** Plain-English roster summary for the hero. */
export function renderCountSummary(sites, skills = []) {
  const libs = Object.values(sites).filter((s) => s.kind === "library").length;
  const tools = Object.values(sites).filter((s) => s.kind === "tool").length;
  const parts = [];
  if (libs > 0) parts.push(`${libs} ${libs === 1 ? "library" : "libraries"}`);
  if (tools > 0) parts.push(`${tools} ${tools === 1 ? "tool" : "tools"}`);
  if (skills.length > 0) {
    parts.push(`${skills.length} ${skills.length === 1 ? "agent skill" : "agent skills"}`);
  }
  if (parts.length === 0) return "";
  if (parts.length === 1) return `${parts[0]}.`;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}.`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}.`;
}

const ORIGIN = "https://baskingspot.dev";

/**
 * llms.txt, llmstxt.org v2: an H1, a blockquote summary, prose, then one H2
 * list per kind. The prose is the contract: every directory has an `index.md`
 * twin, and the router serves it when the request asks for markdown. The twin
 * is the source the site is built from, not an HTML-to-markdown conversion.
 */
export function renderLlmsTxt(sites, skills = []) {
  const sections = COLUMNS.map(({ kind, title }) => {
    const entries = Object.entries(sites).filter(([, site]) => site.kind === kind);
    if (entries.length === 0) return "";
    const items = entries
      .map(([slug, site]) => `- [${slug}](${ORIGIN}/${slug}/): ${site.description}`)
      .join("\n");
    return `## ${title}\n\n${items}\n`;
  }).filter((section) => section !== "");

  return [
    "# baskingspot",
    "",
    "> Zig is cold-blooded. Come bask. Extensions to Zig's standard library, and the tools around it.",
    "",
    "Every guide here is written as markdown and built into HTML, so the markdown",
    "is the source rather than a conversion of the page. Each page has a markdown",
    "copy at the same path with `index.md` in place of the trailing slash:",
    "`/stdx/` is `/stdx/index.md`. Ask for any page with `Accept: text/markdown`",
    "and this site sends the copy instead of the HTML.",
    "",
    ...sections,
    ...(skills.length === 0 ? [] : [renderSkillList(skills)]),
    "## Optional",
    "",
    "- [baskingspot on GitHub](https://github.com/baskingspot): the source for every project listed above.",
    "",
  ].join("\n");
}

/** One H2 list of the skills, for the two markdown twins. */
function renderSkillList(skills) {
  const items = skills
    .map((skill) => `- [${skill.name}](${skill.url}): ${skill.description}`)
    .join("\n");
  return `## Skills\n\n${items}\n`;
}

/**
 * The landing page as markdown: the same roster, minus the styling. This is
 * the `/index.md` twin, so an agent that lands on the front page has the same
 * one-fetch path the library pages have.
 */
export function renderIndexMarkdown(sites, skills = []) {
  const sections = COLUMNS.map(({ kind, title }) => {
    const entries = Object.entries(sites).filter(([, site]) => site.kind === kind);
    if (entries.length === 0) return "";
    const items = entries
      .map(([slug, site]) => `- [${slug}](${ORIGIN}/${slug}/): ${site.description}`)
      .join("\n");
    return `## ${title}\n\n${items}\n`;
  }).filter((section) => section !== "");

  return [
    "# baskingspot",
    "",
    "> Zig is cold-blooded. Come bask. Libraries between std and your application.",
    "",
    ...sections,
    ...(skills.length === 0 ? [] : [renderSkillList(skills)]),
    "## For agents",
    "",
    `- [llms.txt](${ORIGIN}/llms.txt): this roster, in the llmstxt.org format.`,
    "- Every page has a markdown copy. `/stdx/` is `/stdx/index.md`.",
    "",
  ].join("\n");
}

/** sitemap.xml: the front page and one entry per site. A site lists its own pages. */
export function renderSitemap(sites) {
  const urls = ["/", ...Object.keys(sites).map((slug) => `/${slug}/`)];
  const entries = urls.map((path) => `  <url><loc>${ORIGIN}${path}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

/**
 * security.txt, RFC 9116. Reports go to GitHub's private vulnerability form on
 * the org's profile repo. `Expires` is a year after the build, and the router
 * is rebuilt and redeployed whenever norm touches a repo, so it does not lapse
 * while the project is alive.
 */
export function renderSecurityTxt(now) {
  const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  return [
    "Contact: https://github.com/baskingspot/.github/security/advisories/new",
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    "Preferred-Languages: en",
    `Canonical: ${ORIGIN}/.well-known/security.txt`,
    "",
  ].join("\n");
}

if (import.meta.main) {
  const { sites } = JSON.parse(readFileSync(here("../sites.json"), "utf8"));
  const { skills } = JSON.parse(readFileSync(here("skills.json"), "utf8"));
  const template = readFileSync(here("index.html"), "utf8");
  for (const marker of ["<!-- index -->", "<!-- count -->", "<!-- sites -->"]) {
    if (!template.includes(marker)) throw new Error(`index.html has no ${marker} marker`);
  }
  const sections = collectSections(sites, skills);
  const renderedSections = sections.map((section) => renderSection(section)).join("\n");
  rmSync(here("public"), { recursive: true, force: true });
  mkdirSync(here("public"));
  cpSync(here("static"), here("public"), { recursive: true });
  writeFileSync(
    here("public/index.html"),
    template
      .replace("<!-- index -->", renderRailNav(sections))
      .replace("<!-- count -->", renderCountSummary(sites, skills))
      .replace("<!-- sites -->", renderedSections),
  );
  writeFileSync(here("public/index.md"), renderIndexMarkdown(sites, skills));
  writeFileSync(here("public/llms.txt"), renderLlmsTxt(sites, skills));
  writeFileSync(here("public/sitemap.xml"), renderSitemap(sites));
  mkdirSync(here("public/.well-known"));
  writeFileSync(here("public/.well-known/security.txt"), renderSecurityTxt(new Date()));
}
