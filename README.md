# RouteDoctor 🩺

[![RouteDoctor CI](https://github.com/mohitmalayanandy/route-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/mohitmalayanandy/route-doctor/actions/workflows/ci.yml)

**Open-source route, redirect and indexability diagnostics for web developers.**

RouteDoctor is an early-stage, lightweight Node.js CLI. It checks a single HTTP(S) page, traces redirects, checks its basic canonical/indexability signals, and probes the site's conventional `robots.txt` and `sitemap.xml` paths.

> **Status: pre-release starter v0.1.0.** This is not a full crawler, SEO compliance certificate, Google indexing validator, or published npm package. It is designed for contributors to extend.

## Why RouteDoctor?

Developers shipping React/Next.js apps can accidentally introduce redirect chains, `noindex` headers, or inconsistent canonical URLs. RouteDoctor aims to make these checks fast, repeatable and easy to integrate into CI.

## Requirements

- Node.js 22 or later
- One small runtime dependency, [parse5](https://github.com/inikulin/parse5), for spec-compliant HTML parsing (installed by `npm install`)

## Run locally

```bash
git clone https://github.com/mohitmalayanandy/route-doctor.git
cd route-doctor
npm install
npm test
npm run scan -- https://example.com
npm run scan -- https://example.com --json
```

To install the local command on your machine:

```bash
npm link
routedoctor scan https://example.com
routedoctor scan https://example.com --json --timeout 10000 --max-redirects 10
```

The CLI exits with `0` when no errors are found, `1` if it detects errors, and `2` on invalid arguments. Warnings alone do not cause failure.

The JSON report contract is documented in [docs/diagnostics.md](docs/diagnostics.md).

## Current checks (v0.1.0)

- HTTP status of the requested page
- Redirect chain count and redirect loops (max 8 redirects by default)
- HTML `<title>` presence
- HTML `<link rel="canonical">` existence and comparison to final URL
- HTML robots meta and `X-Robots-Tag: noindex`
- Presence of `/robots.txt` and `/sitemap.xml`
- A basic warning when `robots.txt` includes `Disallow: /`
- JSON and text output

## Scope and limitations

- The scanner examines **one URL** plus the conventional robots/sitemap files. It does **not** follow links, parse a sitemap to crawl listed URLs, or verify sitemap content.
- HTML signals use a lightweight parser suitable for common HTML but not all malformed documents.
- Canonical differences can be intentional; they are reported as warnings.
- Robots.txt detection only flags a suspicious rule for **manual review** and does not compute effective bot access.
- It does not execute JavaScript. SSR/HTML output is checked, not client-side rendered changes.
- Only scan sites you own or have permission to test. Use low traffic volumes and respect policies.
- Do not scan internal/privileged endpoints with this CLI; a future security hardening milestone will address network target restrictions.

## Roadmap

### v0.1 — Starter
- [x] CLI core, tracing, single-page indexability checks
- [x] Node test suite and GitHub Actions CI configuration
- [x] README, licence, and contributor guide

### v0.2 — More reliable auditing
- [ ] Evaluate TypeScript migration and structured HTML/XML parsing
- [ ] Parse sitemap URLs and crawl a capped number of public same-origin pages
- [ ] Robust HTML parser and robots.txt interpretation
- [ ] Include route-level JSON and Markdown reports
- [ ] More safety controls: allowed hosts, throttling, private-network protections

### v0.3 — Developer workflows
- [ ] Compare staging/production route health
- [ ] GitHub Actions integration and baseline regression checks
- [ ] Next.js-aware recommendations

### v1.0 — Public stable release
- [ ] Stable configuration, npm publication, and automated releases
- [ ] Comprehensive documentation and contributor onboarding

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Suggested starter issues are in [.github/CONTRIBUTOR_TASKS.md](.github/CONTRIBUTOR_TASKS.md). All respectful contributors are welcome.

## Licence

[MIT](LICENSE) — © 2026 Mohit Malaya Nandy and contributors.
