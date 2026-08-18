#!/usr/bin/env node
// Unified DSH skill tooling: validate, benchmark, review.
// Pure Node.js ESM, zero dependencies.

import { runBenchmark } from './lib/commands/benchmark.mjs';
import { runReview } from './lib/commands/review.mjs';
import { runValidate } from './lib/commands/validate.mjs';

const VERSION = '0.1.0';

const HELP = `dsh-skill-creator ${VERSION}

Usage:
  dsh-skill-creator validate <skill-directory> [--json]
  dsh-skill-creator benchmark <workspace> [options]
  dsh-skill-creator review <workspace> [options]

Commands:
  validate    Validate a DSH SKILL.md.
  benchmark   Aggregate graded runs into benchmark.json and benchmark.md.
  review      Start a local review server.

Global options:
  -h, --help     Show this help.
  -V, --version  Show version.

Run "dsh-skill-creator <command> --help" for command-specific help.`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    console.log(HELP);
    return 0;
  }
  if (argv[0] === '--version' || argv[0] === '-V' || argv[0] === 'version') {
    console.log(VERSION);
    return 0;
  }

  const [command, ...rest] = argv;
  switch (command) {
    case 'validate':
      return runValidate(rest);
    case 'benchmark':
      return runBenchmark(rest);
    case 'review':
      return runReview(rest);
    default:
      console.error(`Unknown command: ${command}`);
      console.error(HELP);
      return 1;
  }
}

try {
  process.exitCode = await main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
}
