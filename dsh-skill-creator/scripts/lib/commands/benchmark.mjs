// benchmark subcommand.

import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { parseOptions } from '../args.mjs';
import { pathExists, writeJson } from '../fs.mjs';
import { findRuns } from '../runs.mjs';
import { buildBenchmark, buildRunResult, markdownTable } from '../benchmark.mjs';

const OPTIONS = [
  { name: '--skill-name', type: 'string' },
  { name: '--skill-path', type: 'string' },
  { name: '--output', alias: '-o', type: 'string' },
  { name: '--primary', type: 'string' },
  { name: '--executor-model', type: 'string' },
  { name: '--analyzer-model', type: 'string' },
  { name: '--help', alias: '-h', type: 'boolean' },
];

export function benchmarkHelp() {
  return `Usage: dsh-skill-creator benchmark <workspace> [options]

Aggregate graded runs into benchmark.json and benchmark.md.

Options:
  --skill-name <name>        Skill name used in the report.
  --skill-path <path>        Skill path used in the report.
  -o, --output <path>        Output JSON path (default: <workspace>/benchmark.json).
  --primary <config>         Primary configuration (default: with_skill if present).
  --executor-model <name>    Executor model shown in metadata.
  --analyzer-model <name>    Analyzer model shown in metadata.
  -h, --help                 Show this help.`;
}

export async function runBenchmark(argv) {
  const parsed = parseOptions(argv, OPTIONS);
  if (parsed.options['--help']) {
    console.log(benchmarkHelp());
    return 0;
  }
  if (parsed.positional.length !== 1) {
    throw new Error(`Expected one workspace directory.\n${benchmarkHelp()}`);
  }

  const workspace = path.resolve(parsed.positional[0]);
  if (!pathExists(workspace)) {
    throw new Error(`Directory not found: ${workspace}`);
  }

  const runs = await findRuns(workspace);
  if (runs.length === 0) {
    throw new Error(`No runs found under ${workspace}`);
  }

  const gradedRuns = runs.filter((run) => run.grading);
  const skipped = runs.length - gradedRuns.length;
  if (skipped > 0) {
    console.warn(`Warning: skipped ${skipped} run(s) without grading.json`);
  }
  if (gradedRuns.length === 0) {
    throw new Error(`No graded runs found under ${workspace}`);
  }

  const results = gradedRuns.map((run) => {
    const result = buildRunResult(run);
    const invalid = result.expectations.find(
      (exp) => typeof exp.text !== 'string' || typeof exp.passed !== 'boolean' || typeof exp.evidence !== 'string'
    );
    if (invalid) {
      console.warn(`Warning: expectation in ${path.join(run.dir, 'grading.json')} must contain text, passed, and evidence fields`);
    }
    return result;
  });

  const benchmark = buildBenchmark({
    benchmarkDir: workspace,
    results,
    skillName: parsed.options['--skill-name'],
    skillPath: parsed.options['--skill-path'],
    executorModel: parsed.options['--executor-model'],
    analyzerModel: parsed.options['--analyzer-model'],
    primary: parsed.options['--primary'],
  });

  const configs = Object.keys(benchmark.run_summary).filter((key) => key !== 'delta');
  if (configs.length > 2) {
    console.warn(`Warning: ${configs.length} configurations found; delta compares ${configs[0]} vs ${configs[1]}`);
  }

  const outputJson = parsed.options['--output']
    ? path.resolve(parsed.options['--output'])
    : path.join(workspace, 'benchmark.json');
  const outputMd = /\.json$/i.test(outputJson)
    ? outputJson.replace(/\.json$/i, '.md')
    : `${outputJson}.md`;

  await writeJson(outputJson, benchmark);
  await writeFile(outputMd, markdownTable(benchmark) + '\n');

  console.log(`Generated: ${outputJson}`);
  console.log(`Generated: ${outputMd}`);
  for (const config of configs) {
    const pr = benchmark.run_summary[config].pass_rate.mean;
    console.log(`  ${config.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}: ${(pr * 100).toFixed(1)}% pass rate`);
  }
  console.log(`  Delta: ${benchmark.run_summary.delta?.pass_rate ?? '—'}`);
  return 0;
}
