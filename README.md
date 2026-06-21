# POLIS — City Builder

A self-contained, single-file browser city-building game. No build step, no
dependencies — the entire game lives in [`index.html`](./index.html).

## Play

Live at **[polis-game.com](https://polis-game.com)**.

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tests

A small Playwright suite in [`tests/`](./tests) loads the real `index.html`
headless and asserts simulation **invariants** (save round-trips, budget
accounting, growth gating, networks, loans) rather than golden numbers, so
balance tuning won't break them.

```bash
cd tests
npm ci
npx playwright install --with-deps chromium
npm test
```

CI runs the suite on every push and pull request via
[`.github/workflows/test.yml`](./.github/workflows/test.yml) to catch a broken
`index.html` before it deploys.

## Hosting

This is a static site (one HTML file), deployed via GitHub Pages.
