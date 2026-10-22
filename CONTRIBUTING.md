# Contributing to RouteDoctor

Thanks for helping build RouteDoctor!

## Getting started

1. Fork the GitHub repository.
2. Create a focused branch: `git checkout -b fix/short-description`.
3. Use Node.js 22+.
4. Run `npm test` and `npm run check`.
5. Add or update tests for behavior changes.
6. Open a PR and link an issue where relevant.

## Development principles

- Start with clear, actionable diagnostics and avoid false certainty.
- Favor no-dependency solutions unless a dependency clearly improves reliability. The only runtime dependency is `parse5`: regular expressions mishandle comments, script text, entities and quoted `>` in HTML. Justify any new dependency the same way.
- Keep network requests limited, visible, and safe.
- Avoid making unverifiable indexing claims; Google indexing is not controlled by this tool.
- Do not send private page content or secrets into logs or issues.
- Keep PRs small and document edge cases.

## Commit guidance

Examples: `feat: parse sitemap index`, `fix: detect redirect cycle`, `test: cover noindex headers`.

## Code of Conduct

Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
