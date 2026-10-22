# Contributor issue drafts

These are ready to copy into GitHub issues; they have not been published.

## Document CLI exit codes with runnable examples
Labels: documentation, good first issue

Add examples of warning-only and error reports to the README.
Acceptance: show exit codes 0, 1, and 2; distinguish argument failures from scan
findings; verify examples against local fixtures without external websites.

## Adopt a robust HTML parser (v0.2)
Labels: enhancement

Evaluate parse5 or Cheerio, documenting dependency and compatibility tradeoffs.
Acceptance: canonical checks handle entities, base URLs, quoted greater-than
signs, comments, and script contents; regression fixtures cover each case.
Preserve the diagnostic contract and dependency decision in documentation.

## Design public-network request protections before crawling (v0.2)
Labels: security, enhancement

Define and implement a target policy for initial requests and every redirect.
Acceptance: cover IPv4/IPv6 private and special-use addresses, DNS rebinding,
explicit local-development opt-in, and tests using controlled DNS/HTTP fixtures.
Do not enable broad crawling before this policy is reviewed.
