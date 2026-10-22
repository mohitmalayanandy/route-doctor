# Changelog

## [Unreleased]

### Fixed
- Treat the robots `none` directive as `noindex`, and stop flagging value directives such as `max-image-preview:none`.
- Restore missing GitHub Actions CI and contributor issue templates.
- Detect robots.txt blanket disallow rules and preserve trailing slashes in canonical comparison.
- Ignore fragments when tracing HTTP redirects and order site-file diagnostics deterministically.

### Added
- Versioned JSON report schema and documented exit-code contract.
- Redirect and canonical edge-case regression coverage.
- Contributor issue drafts and consistent routedoctor package metadata.
- Initial zero-dependency CLI prototype for single-page URL diagnostics.
- Redirect tracing, basic metadata checks, robots.txt and sitemap.xml probes.
- JSON output, test suite, CI and community files.
