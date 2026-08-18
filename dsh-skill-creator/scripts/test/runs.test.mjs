import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { findRuns } from '../lib/runs.mjs';

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-runs-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeJson(file, data) {
  await writeFile(file, JSON.stringify(data, null, 2));
}

test('findRuns discovers direct config directories and run-N directories', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, 'eval-1', 'with_skill', 'outputs'), { recursive: true });
    await mkdir(path.join(root, 'eval-1', 'without_skill', 'run-1', 'outputs'), { recursive: true });
    await mkdir(path.join(root, 'eval-1', 'without_skill', 'run-2', 'outputs'), { recursive: true });
    await writeJson(path.join(root, 'eval-1', 'eval_metadata.json'), {
      eval_id: 'eval-1',
      eval_name: 'Parse CSV',
      prompt: 'Parse the CSV',
    });
    await writeJson(path.join(root, 'eval-1', 'with_skill', 'execution.json'), {
      run_number: 1,
      total_tokens: 10,
    });
    await writeJson(path.join(root, 'eval-1', 'without_skill', 'run-1', 'execution.json'), {
      total_tokens: 5,
    });
    await writeJson(path.join(root, 'eval-1', 'without_skill', 'run-2', 'execution.json'), {
      run_number: 2,
      total_tokens: 7,
    });

    const runs = await findRuns(root);
    assert.equal(runs.length, 3);
    const byId = new Map(runs.map((run) => [run.id, run]));

    const withSkill = byId.get('eval-1-with_skill');
    assert.ok(withSkill);
    assert.equal(withSkill.configuration, 'with_skill');
    assert.equal(withSkill.run_number, 1);
    assert.equal(withSkill.eval_id, 'eval-1');
    assert.equal(withSkill.prompt, 'Parse the CSV');

    const run1 = byId.get('eval-1-without_skill-run-1');
    assert.ok(run1);
    assert.equal(run1.configuration, 'without_skill');
    assert.equal(run1.run_number, 1);
    assert.equal(run1.eval_name, 'Parse CSV');

    const run2 = byId.get('eval-1-without_skill-run-2');
    assert.ok(run2);
    assert.equal(run2.configuration, 'without_skill');
    assert.equal(run2.run_number, 2);
  });
});

test('findRuns falls back to directory name when eval_id is missing', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, 'eval-42', 'with_skill', 'outputs'), { recursive: true });
    const runs = await findRuns(root);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].eval_id, 'eval-42');
  });
});
