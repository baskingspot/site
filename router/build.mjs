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

/** The columns of the landing page, in order. A site's `kind` picks its column. */
export const COLUMNS = [
  { kind: "library", title: "Libraries" },
  { kind: "tool", title: "Tools" },
];

/** One list item per site, in roster order. */
function renderItems(entries) {
  return entries
    .map(
      ([slug, site]) =>
        `          <li><a href="/${slug}/">${escapeHtml(slug)}</a><p>${escapeHtml(site.description)}</p></li>`,
    )
    .join("\n");
}

/**
 * One section per kind that has sites, each a heading over a list. A kind with
 * no sites gets no section, so the page never shows an empty column. A site
 * with an unknown or missing kind is an error, so a typo cannot hide a site.
 */
export function renderSites(sites) {
  const known = new Set(COLUMNS.map((column) => column.kind));
  for (const [slug, site] of Object.entries(sites)) {
    if (!known.has(site.kind)) {
      throw new Error(
        `sites.json: ${slug} has kind ${JSON.stringify(site.kind)}, want one of ${[...known].join(", ")}`,
      );
    }
  }
  return COLUMNS.map(({ kind, title }) => {
    const entries = Object.entries(sites).filter(([, site]) => site.kind === kind);
    if (entries.length === 0) return "";
    return `        <section>\n          <h2>${title}</h2>\n          <ul>\n${renderItems(entries)}\n          </ul>\n        </section>`;
  })
    .filter((section) => section !== "")
    .join("\n");
}

const ORIGIN = "https://baskingspot.dev";

/**
 * The org's agent skills, which live in baskingspot/skills rather than behind
 * this router. They get a section of their own in the roster, the landing page,
 * and llms.txt, because a skill is the thing that teaches an agent the house
 * style and a guide cannot.
 */
export function renderSkills(skills) {
  if (skills.length === 0) return "";
  const items = skills
    .map(
      (skill) =>
        `          <li><a href="${escapeHtml(skill.url)}">${escapeHtml(skill.name)}</a><p>${escapeHtml(skill.description)}</p></li>`,
    )
    .join("\n");
  return `        <section>\n          <h2>Agent skills</h2>\n          <ul>\n${items}\n          </ul>\n        </section>`;
}

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
  if (!template.includes("<!-- sites -->"))
    throw new Error("index.html has no <!-- sites --> marker");
  rmSync(here("public"), { recursive: true, force: true });
  mkdirSync(here("public"));
  cpSync(here("static"), here("public"), { recursive: true });
  writeFileSync(
    here("public/index.html"),
    template.replace("<!-- sites -->", `${renderSites(sites)}\n${renderSkills(skills)}`),
  );
  writeFileSync(here("public/index.md"), renderIndexMarkdown(sites, skills));
  writeFileSync(here("public/llms.txt"), renderLlmsTxt(sites, skills));
  writeFileSync(here("public/sitemap.xml"), renderSitemap(sites));
  mkdirSync(here("public/.well-known"));
  writeFileSync(here("public/.well-known/security.txt"), renderSecurityTxt(new Date()));
}
