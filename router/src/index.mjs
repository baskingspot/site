// The router. A request for /<slug>/... goes to the service binding for that
// slug. Anything else is the landing page: the assets layer answers it before
// this script runs, so only paths the assets do not have reach here.
//
// The router also owns two things every response from it shares: the security
// headers a site does not set for itself, and the 404 page. A site that
// answers 404 gets the branded page in place of its plain text.
//
// And it owns markdown for agents. Every page has a twin at the same path with
// `index.md` in place of the trailing slash, built from the markdown the site
// was generated from. A request that asks for markdown gets the twin; every
// other response advertises it with a Link header, so an agent that did not
// know to ask finds out.

import { NOT_FOUND_HTML } from "./notfound.mjs";

/** Headers added to everything the router sends. A site's own header wins. */
export const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "x-frame-options": "DENY",
};

/** The binding name for a slug: stdx is SITE_STDX, zig-benchmark is SITE_ZIG_BENCHMARK. */
export function bindingName(slug) {
  return `SITE_${slug.toUpperCase().replaceAll("-", "_")}`;
}

/** The binding for the first path segment, or undefined if it names no site. */
export function siteFor(env, pathname) {
  const slug = pathname.split("/")[1] ?? "";
  if (!/^[a-z0-9-]+$/.test(slug)) return undefined;
  return env[bindingName(slug)];
}

/**
 * The markdown twin of a page path. Sites are built by Zola, so a page is a
 * directory holding index.html: `/stdx/` is `/stdx/index.md`, and `/stdx` is
 * the same page before the trailing-slash redirect. A path with an extension
 * is a file, not a page, and has no twin.
 */
export function markdownTwin(pathname) {
  if (pathname.endsWith("/")) return `${pathname}index.md`;
  if (pathname.includes(".")) return undefined;
  return `${pathname}/index.md`;
}

/** The quality a client attached to a media type, or undefined when absent. */
export function quality(accept, type) {
  if (!accept) return undefined;
  for (const part of accept.split(",")) {
    const [media, ...params] = part.trim().toLowerCase().split(";");
    if (media !== type) continue;
    const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
    if (q === undefined) return 1;
    const value = Number.parseFloat(q.slice(2));
    return Number.isNaN(value) ? 1 : value;
  }
  return undefined;
}

/** Where a media type first appears in the header, or undefined when absent. */
function position(accept, type) {
  const parts = accept.split(",");
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index].trim().toLowerCase().split(";")[0] === type) return index;
  }
  return undefined;
}

/**
 * True when the request asked for markdown over HTML. `* / *` alone is not a
 * request for markdown, so curl and a browser both get HTML.
 */
export function prefersMarkdown(request) {
  const accept = request.headers.get("accept");
  const markdown = quality(accept, "text/markdown");
  if (markdown === undefined || markdown === 0) return false;
  const html = quality(accept, "text/html");
  if (html === undefined) return true;
  if (markdown !== html) return markdown > html;
  // Equal quality: take the one the client listed first. Agents that want
  // markdown send `text/markdown, text/html`, and quality alone gives a server
  // no other way to read that.
  return position(accept, "text/markdown") < position(accept, "text/html");
}

/**
 * What every response advertises: the markdown twin of this page, and the
 * llms.txt that covers it. The file at the root describes the whole site, and
 * the spec says the most specific one that exists applies.
 */
export function discoveryLink(pathname, twin) {
  if (twin === undefined) return '</llms.txt>; rel="describedby"';
  return `</${twin.replace(/^\//, "")}>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"`;
}

/** A copy of the response with the security headers and any extra ones, which win. */
export function withHeaders(response, extra = {}) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** The branded 404. A HEAD request gets the headers and no body. */
export function notFound(request) {
  const body = request.method === "HEAD" ? null : NOT_FOUND_HTML;
  return withHeaders(
    new Response(body, {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    }),
  );
}

/**
 * The twin, or undefined when there is none. A 404 is cancelled rather than
 * read: the router falls back to the HTML page, and an unread body is a leak.
 */
async function fetchTwin(fetcher, request, twin) {
  const url = new URL(request.url);
  url.pathname = twin;
  const response = await fetcher(new Request(url, request));
  if (response.status !== 200) {
    await response.body?.cancel();
    return undefined;
  }
  return response;
}

/**
 * The response for a markdown request: the twin's body, said to be markdown
 * whatever the asset layer thought, and kept out of search indexes so it does
 * not compete with the page it mirrors. The body is read so the size is known:
 * an asset response is chunked and carries no content-length.
 */
async function markdownResponse(response, pathname, twin) {
  const body = await response.arrayBuffer();
  const headers = {
    "content-type": "text/markdown; charset=utf-8",
    vary: "accept",
    "x-robots-tag": "noindex, nofollow",
    link: discoveryLink(pathname, twin),
    "content-length": String(body.byteLength),
    // Four bytes to the token, the estimate Cloudflare's Markdown for Agents
    // reports. Enough to size a context budget, not an exact count.
    "x-markdown-tokens": String(Math.ceil(body.byteLength / 4)),
  };
  return withHeaders(new Response(body, { status: response.status, headers }), headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // The landing page is an asset, and assets answer before this script runs
    // unless wrangler.jsonc names the path in run_worker_first. It does, for
    // `/`, so that the front page can negotiate markdown too.
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const twin = "/index.md";
      if (prefersMarkdown(request)) {
        const response = await fetchTwin((req) => env.ASSETS.fetch(req), request, twin);
        if (response !== undefined) return markdownResponse(response, "/", twin);
      }
      const home = await env.ASSETS.fetch(request);
      return withHeaders(home, { vary: "accept", link: discoveryLink("/", twin) });
    }

    const site = siteFor(env, url.pathname);
    if (site === undefined) return notFound(request);

    const twin = markdownTwin(url.pathname);
    if (twin !== undefined && prefersMarkdown(request)) {
      const response = await fetchTwin((req) => site.fetch(req), request, twin);
      if (response !== undefined) return markdownResponse(response, url.pathname, twin);
    }

    const response = await site.fetch(request);
    if (response.status === 404) return notFound(request);
    return withHeaders(response, { vary: "accept", link: discoveryLink(url.pathname, twin) });
  },
};
