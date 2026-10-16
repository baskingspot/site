// The router. A request for /<slug>/... goes to the service binding for that
// slug. Anything else is the landing page: the assets layer answers it before
// this script runs, so only paths the assets do not have reach here.

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

export default {
  async fetch(request, env) {
    const site = siteFor(env, new URL(request.url).pathname);
    if (site === undefined) return new Response("not found\n", { status: 404 });
    return site.fetch(request);
  },
};
