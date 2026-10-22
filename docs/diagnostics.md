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

`inputUrl` is the parsed input URL. `finalUrl` is the last resolved HTTP target;
on a redirect failure it may not have been fetched. `status` is null if no final
response was read successfully. `redirects` records ordered `{from, status, to}`
hops, including the hop that reveals a loop or exceeds the configured limit.
URL fragments are removed from HTTP targets. Canonical comparison ignores
fragments but preserves query strings and trailing slashes.

Exit codes: 0 means no error findings (warnings may exist), 1 means at least one
error finding, and 2 means invalid input or an unexpected execution failure.
For exit code 2, JSON mode returns `{ "error": "Error: ..." }` for scan execution
failures; argument parsing failures write usage to stderr and emit no JSON.
These failures are not diagnostic reports.

The v0.1 HTML parser handles common markup only. Sitemap checks verify endpoint
presence, not XML validity. Private-network restrictions and crawling remain
future work.
