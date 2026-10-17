// The router. A request for /<slug>/... goes to the service binding for that
// slug. Anything else is the landing page: the assets layer answers it before
// this script runs, so only paths the assets do not have reach here.
//
// The router also owns two things every response from it shares: the security
// headers a site does not set for itself, and the 404 page. A site that
// answers 404 gets the branded page in place of its plain text.

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

/** A copy of the response with the security headers, keeping any the response already set. */
export function withHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const site = siteFor(env, new URL(request.url).pathname);
    if (site === undefined) return notFound(request);
    const response = await site.fetch(request);
    return response.status === 404 ? notFound(request) : withHeaders(response);
  },
};
