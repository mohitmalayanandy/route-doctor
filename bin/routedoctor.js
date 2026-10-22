#!/usr/bin/env node
import { scanSite } from '../src/scanner.js';

function usage() {
  return `RouteDoctor v0.1.0 (pre-release)

Usage:
  routedoctor scan <https://example.com> [--json] [--timeout <ms>] [--max-redirects <n>]
  routedoctor --help

Flags:
  --json              Print machine-readable JSON instead of the terminal report
  --timeout <ms>      Timeout per HTTP request (default: 8000, range: 100–60000)
  --max-redirects <n> Maximum HTTP redirects per request (default: 8, range: 0–30)

Note: This starter checks one HTML page and the site's robots.txt and sitemap.xml.
It does not yet crawl all site routes or compare deployments.`;
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) return { help: true };
  if (argv[0] !== 'scan') throw new Error('Expected "scan" command.');
  if (!argv[1] || argv[1].startsWith('--')) throw new Error('Expected an HTTP(S) URL after "scan".');
  const opts = { url: argv[1], json: false, timeoutMs: 8000, maxRedirects: 8 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') { opts.json = true; continue; }
    if (arg === '--timeout' || arg === '--max-redirects') {
      const value = argv[++i];
      if (!value || !/^\d+$/.test(value)) throw new Error(`${arg} requires a whole number.`);
      const n = Number(value);
      const min = arg === '--timeout' ? 100 : 0;
      const max = arg === '--timeout' ? 60000 : 30;
      if (n < min || n > max) throw new Error(`${arg} must be between ${min} and ${max}.`);
      if (arg === '--timeout') opts.timeoutMs = n;
      else opts.maxRedirects = n;
      continue;
    }
    throw new Error(`Unrecognized option: ${arg}`);
  }
  return opts;
}

function renderReport(report) {
  const symbols = { pass: '✓', warning: '!', error: '✗' };
  const lines = [
    `RouteDoctor — ${report.inputUrl}`,
    `Final URL: ${report.finalUrl ?? 'unavailable'}`,
    '',
    ...report.checks.map((c) => `${symbols[c.severity]} [${c.severity.toUpperCase()}] ${c.message}`),
    '',
    `Summary: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ${report.summary.passed} passed`
  ];
  return lines.join('\n');
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`Error: ${e.message}\n\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  if (opts.help) { console.log(usage()); return; }
  try {
    const report = await scanSite(opts.url, opts);
    console.log(opts.json ? JSON.stringify(report, null, 2) : renderReport(report));
    if (report.summary.errors > 0) process.exitCode = 1;
  } catch (e) {
    const message = `Error: ${e.message}`;
    if (opts.json) console.log(JSON.stringify({ error: message }));
    else console.error(message);
    process.exitCode = 2;
  }
}

await main();
