# Diagnostic result contract (schema version 1)

`scanSite(url, options)` and successful `scan --json` executions return the same
report, described by [diagnostic-result.schema.json](diagnostic-result.schema.json).
`version` identifies the tool release; `schemaVersion` identifies this contract.
Existing fields and severity meanings must not change within a schema version.
New check codes may be added; consumers should tolerate unknown codes.

Each check has `severity` (`pass`, `warning`, or `error`), a machine-readable
uppercase `code`, and a human-readable `message`. Use codes, not message text,
for automation. `summary` counts each severity. Checks appear in page, robots,
then sitemap order regardless of network completion order.

`NOINDEX` is raised when a robots meta tag or `X-Robots-Tag` header contains
`noindex` or `none` (which implies `noindex, nofollow`). A user-agent prefix such
as `googlebot: noindex` counts; value directives such as `max-image-preview:none`
do not.

`inputUrl` is the parsed input URL. `finalUrl` is the last resolved HTTP target;
on a redirect failure it may not have been fetched. `status` is null if no final
response was read successfully. `redirects` records ordered `{from, status, to}`
hops, including the hop that reveals a loop or exceeds the configured limit.
URL fragments are removed from HTTP targets. Canonical comparison ignores
fragments but preserves query strings and trailing slashes.

Response bodies are read up to 512,000 bytes. A larger page is analysed from its
first 512,000 bytes and gets a `BODY_TRUNCATED` warning; checks that depend on
content past that point (for example a canonical tag) may then be missing.
`BODY_READ_FAILED` now means the connection broke or the body could not be read.

Exit codes: 0 means no error findings (warnings may exist), 1 means at least one
error finding, and 2 means invalid input or an unexpected execution failure.
For exit code 2, JSON mode returns `{ "error": "Error: ..." }` for scan execution
failures; argument parsing failures write usage to stderr and emit no JSON.
These failures are not diagnostic reports.

HTML is parsed with parse5 following the HTML specification, so comments,
script/noscript text, entities and quoted `>` behave as in a browser. Title,
canonical and robots meta are read from `<head>` only, and a relative canonical
resolves against `<base href>` when one is present. Sitemap checks verify endpoint
presence, not XML validity. Private-network restrictions and crawling remain
future work.
