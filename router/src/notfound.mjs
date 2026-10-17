// The 404 page, as a string. It lives in the script and not in the assets so
// that /404 is not itself a page that answers 200.

export const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Not found · baskingspot</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>
      :root {
        color-scheme: light dark;
        --ink: #16191d;
        --paper: #f4f1ec;
        --heat: #d4412b;
        --bg: light-dark(var(--paper), var(--ink));
        --fg: light-dark(var(--ink), var(--paper));
        --muted: light-dark(#58616c, #a3abb5);
        --link-hover: light-dark(#b8321d, #e8604a);
      }
      body {
        margin: 0 auto;
        max-width: 40rem;
        padding: 4rem 1.5rem;
        background: var(--bg);
        color: var(--fg);
        font: 1.125rem/1.55 system-ui, sans-serif;
      }
      img {
        height: 56px;
      }
      p {
        margin: 0;
      }
      .code {
        margin-top: 3rem;
        color: var(--heat);
        font: 600 0.9rem/1 ui-monospace, monospace;
        letter-spacing: 0.06em;
      }
      h1 {
        margin: 0.75rem 0 0;
        font-size: 1.75rem;
        line-height: 1.25;
        font-weight: 400;
      }
      .what {
        margin-top: 0.5rem;
        color: var(--muted);
      }
      a {
        color: inherit;
        text-decoration-color: var(--heat);
        text-decoration-thickness: 2px;
        text-underline-offset: 0.2em;
      }
      a:hover {
        color: var(--link-hover);
      }
    </style>
  </head>
  <body>
    <a href="/">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="/logo-dark.svg" />
        <img src="/logo.svg" alt="baskingspot" />
      </picture>
    </a>
    <p class="code">404</p>
    <h1>Nothing is basking here.</h1>
    <p class="what">There is no page at this address. <a href="/">The front page</a> lists what there is.</p>
  </body>
</html>
`;
