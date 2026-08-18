import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBenchmark,
  buildRunResult,
  markdownTable,
  stats,
} from '../lib/benchmark.mjs';

function makeRun({ evalId, evalName, config, runNumber = 1, passRate, tokens, timeSeconds }) {
  return {
    eval_id: evalId,
    eval_name: evalName,
    configuration: config,
    run_number: runNumber,
    grading: {
      summary: {
        passed: passRate * 2,
        failed: 2 - passRate * 2,
        total: 2,
        pass_rate: passRate,
      },
      expectations: [{ text: 'x', passed: passRate > 0, evidence: 'e' }],
      user_notes_summary: { uncertainties: [] },
    },
    execution: {
      run_number: runNumber,
      total_tokens: tokens,
      total_duration_seconds: timeSeconds,
      total_tool_calls: 3,
      errors_encountered: 0,
    },
  };
}

function makeRunResult(options) {
  return buildRunResult(makeRun(options));
}

test('stats computes mean/stddev/min/max', () => {
  const s = stats([1, 2, 3]);
  assert.equal(s.mean, 2);
  assert.equal(s.min, 1);
  assert.equal(s.max, 3);
  assert.equal(s.stddev, 1);
});

test('buildRunResult reads execution fields', () => {
  const result = buildRunResult(makeRun({
    evalId: 'eval-1',
    evalName: 'Eval',
    config: 'with_skill',
    passRate: 0.5,
    tokens: 100,
    timeSeconds: 3,
  }));
  assert.equal(result.result.tokens, 100);
  assert.equal(result.result.time_seconds, 3);
  assert.equal(result.result.pass_rate, 0.5);
});

test('aggregate uses with_skill as primary and builds delta', () => {
  const { buildBenchmark: build } = { buildBenchmark };
  const benchmark = build({
    benchmarkDir: '/tmp/bench',
    results: [
      makeRunResult({ evalId: 'eval-1', evalName: 'A', config: 'with_skill', passRate: 1, tokens: 100, timeSeconds: 2 }),
      makeRunResult({ evalId: 'eval-1', evalName: 'A', config: 'without_skill', passRate: 0, tokens: 50, timeSeconds: 1 }),
    ],
    skillName: 'demo',
  });
  const configs = Object.keys(benchmark.run_summary).filter((key) => key !== 'delta');
  assert.deepEqual(configs, ['with_skill', 'without_skill']);
  assert.equal(benchmark.run_summary.delta.pass_rate, '+1.00');
  assert.deepEqual(benchmark.metadata.evals_run, ['eval-1']);
});

test('markdownTable contains both configs', () => {
  const benchmark = buildBenchmark({
    benchmarkDir: '/tmp/bench',
    results: [
      makeRunResult({ evalId: 'eval-1', evalName: 'A', config: 'with_skill', passRate: 1, tokens: 100, timeSeconds: 2 }),
      makeRunResult({ evalId: 'eval-1', evalName: 'A', config: 'without_skill', passRate: 0, tokens: 50, timeSeconds: 1 }),
    ],
    skillName: 'demo',
    executorModel: 'model-x',
  });
  const md = markdownTable(benchmark);
  assert.match(md, /With Skill/);
  assert.match(md, /Without Skill/);
  assert.match(md, /model-x/);
});
