// Benchmark aggregation and Markdown rendering.

import path from 'node:path';

export function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function stats(values) {
  if (values.length === 0) {
    return { mean: 0, stddev: 0, min: 0, max: 0 };
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.length > 1
    ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1)
    : 0;
  return {
    mean: round(mean, 4),
    stddev: round(Math.sqrt(variance), 4),
    min: round(Math.min(...values), 4),
    max: round(Math.max(...values), 4),
  };
}

export function buildRunResult(run) {
  const grading = run.grading || {};
  const summary = grading.summary || {};
  const execution = run.execution || {};
  const timing = grading.timing || execution;
  const metrics = grading.execution_metrics || execution;

  const expectations = Array.isArray(grading.expectations) ? grading.expectations : [];
  const userNotes = grading.user_notes_summary || {};
  const notes = [
    ...(userNotes.uncertainties || []),
    ...(userNotes.needs_review || []),
    ...(userNotes.workarounds || []),
  ];

  return {
    eval_id: run.eval_id,
    eval_name: run.eval_name,
    configuration: run.configuration,
    run_number: run.run_number,
    result: {
      pass_rate: Number(summary.pass_rate ?? 0),
      passed: Number(summary.passed ?? 0),
      failed: Number(summary.failed ?? 0),
      total: Number(summary.total ?? 0),
      time_seconds: Number(timing.total_duration_seconds ?? 0),
      tokens: Number(execution.total_tokens ?? timing.total_tokens ?? 0),
      tool_calls: Number(execution.total_tool_calls ?? metrics.total_tool_calls ?? 0),
      errors: Number(execution.errors_encountered ?? metrics.errors_encountered ?? 0),
    },
    expectations,
    notes,
  };
}

export function aggregate(results, { primary: primaryOption } = {}) {
  const byConfig = new Map();
  for (const run of results) {
    const list = byConfig.get(run.configuration) || [];
    list.push(run);
    byConfig.set(run.configuration, list);
  }

  const configs = [...byConfig.keys()].sort();
  const primary = primaryOption || (configs.includes('with_skill') ? 'with_skill' : configs[0]);
  if (!configs.includes(primary)) {
    throw new Error(`Primary configuration '${primary}' was not found in runs`);
  }
  const others = configs.filter((config) => config !== primary).sort();
  const ordered = [primary, ...others];

  const runSummary = {};
  for (const config of ordered) {
    const runs = byConfig.get(config);
    runSummary[config] = {
      pass_rate: stats(runs.map((run) => run.result.pass_rate)),
      time_seconds: stats(runs.map((run) => run.result.time_seconds)),
      tokens: stats(runs.map((run) => run.result.tokens)),
    };
  }

  if (ordered.length >= 2) {
    const a = runSummary[ordered[0]];
    const b = runSummary[ordered[1]];
    const sign = (value) => (value >= 0 ? '+' : '');
    runSummary.delta = {
      pass_rate: `${sign(a.pass_rate.mean - b.pass_rate.mean)}${(a.pass_rate.mean - b.pass_rate.mean).toFixed(2)}`,
      time_seconds: `${sign(a.time_seconds.mean - b.time_seconds.mean)}${(a.time_seconds.mean - b.time_seconds.mean).toFixed(1)}`,
      tokens: `${sign(a.tokens.mean - b.tokens.mean)}${(a.tokens.mean - b.tokens.mean).toFixed(0)}`,
    };
  } else {
    runSummary.delta = { pass_rate: '—', time_seconds: '—', tokens: '—' };
  }

  return { runSummary, orderedConfigs: ordered, primary };
}

export function buildBenchmark({
  benchmarkDir,
  results,
  skillName,
  skillPath,
  executorModel,
  analyzerModel,
  primary,
}) {
  const { runSummary } = aggregate(results, { primary });
  const runs = results.map((run) => ({
    eval_id: run.eval_id,
    eval_name: run.eval_name,
    configuration: run.configuration,
    run_number: run.run_number,
    result: run.result,
    expectations: run.expectations,
    notes: run.notes,
  }));

  const byConfigCounts = new Map();
  for (const run of results) {
    byConfigCounts.set(run.configuration, (byConfigCounts.get(run.configuration) || 0) + 1);
  }
  const runsPerConfig = Math.max(1, ...byConfigCounts.values());
  const evalIds = [...new Set(results.map((run) => run.eval_id))].sort();

  return {
    metadata: {
      skill_name: skillName || path.basename(benchmarkDir) || '<skill-name>',
      skill_path: skillPath || '<path/to/skill>',
      executor_model: executorModel || '<model-name>',
      analyzer_model: analyzerModel || '<model-name>',
      timestamp: new Date().toISOString(),
      evals_run: evalIds,
      runs_per_configuration: runsPerConfig,
    },
    runs,
    run_summary: runSummary,
    notes: [],
  };
}

function label(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtPR(s) {
  return `${Math.round((s?.mean ?? 0) * 100)}% ± ${Math.round((s?.stddev ?? 0) * 100)}%`;
}

function fmtTime(s) {
  return `${(s?.mean ?? 0).toFixed(1)}s ± ${(s?.stddev ?? 0).toFixed(1)}s`;
}

function fmtTokens(s) {
  return `${Math.round(s?.mean ?? 0)} ± ${Math.round(s?.stddev ?? 0)}`;
}

export function markdownTable(benchmark) {
  const configs = Object.keys(benchmark.run_summary).filter((key) => key !== 'delta');
  const a = configs[0] ? benchmark.run_summary[configs[0]] : {};
  const b = configs[1] ? benchmark.run_summary[configs[1]] : {};
  const delta = benchmark.run_summary.delta || {};

  const lines = [
    `# Skill Benchmark: ${benchmark.metadata.skill_name}`,
    '',
    `**Model**: ${benchmark.metadata.executor_model}`,
    `**Date**: ${benchmark.metadata.timestamp}`,
    `**Evals**: ${benchmark.metadata.evals_run.join(', ') || 'none'} (${benchmark.metadata.runs_per_configuration} run(s) each per configuration)`,
    '',
    '## Summary',
    '',
    `| Metric | ${label(configs[0] || 'config_a')} | ${label(configs[1] || 'config_b')} | Delta |`,
    '|--------|------------|---------------|-------|',
    `| Pass Rate | ${fmtPR(a.pass_rate)} | ${fmtPR(b.pass_rate)} | ${delta.pass_rate ?? '—'} |`,
    `| Time | ${fmtTime(a.time_seconds)} | ${fmtTime(b.time_seconds)} | ${delta.time_seconds ?? '—'}s |`,
    `| Tokens | ${fmtTokens(a.tokens)} | ${fmtTokens(b.tokens)} | ${delta.tokens ?? '—'} |`,
  ];

  if (benchmark.notes && benchmark.notes.length > 0) {
    lines.push('', '## Notes', '');
    for (const note of benchmark.notes) lines.push(`- ${note}`);
  }

  return lines.join('\n');
}
