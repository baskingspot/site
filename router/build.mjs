// Builds router/public/, the assets the router serves: the files in static/,
// and index.html with one entry per site in sites.json. Run by `just build`.
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

if (import.meta.main) {
  const { sites } = JSON.parse(readFileSync(here("../sites.json"), "utf8"));
  const template = readFileSync(here("index.html"), "utf8");
  if (!template.includes("<!-- sites -->"))
    throw new Error("index.html has no <!-- sites --> marker");
  rmSync(here("public"), { recursive: true, force: true });
  mkdirSync(here("public"));
  cpSync(here("static"), here("public"), { recursive: true });
  writeFileSync(here("public/index.html"), template.replace("<!-- sites -->", renderSites(sites)));
}
