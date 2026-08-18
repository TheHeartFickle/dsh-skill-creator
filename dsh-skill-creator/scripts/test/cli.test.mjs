import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dsh-skill-creator.mjs', import.meta.url));

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-cli-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function writeJson(file, data) {
  await writeFile(file, JSON.stringify(data, null, 2));
}

async function makeValidSkill(dir) {
  const skillDir = path.join(dir, 'cli-test-skill');
  await mkdir(skillDir);
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: cli-test-skill\ndescription: A test skill\n---\n\nBody\n'
  );
  return skillDir;
}

async function makeWorkspace(dir) {
  await mkdir(path.join(dir, 'eval-0', 'with_skill', 'outputs'), { recursive: true });
  await mkdir(path.join(dir, 'eval-0', 'without_skill', 'outputs'), { recursive: true });
  await writeJson(path.join(dir, 'eval-0', 'eval_metadata.json'), {
    eval_id: 'eval-0',
    eval_name: 'sample',
    prompt: 'do something',
  });
  await writeJson(path.join(dir, 'eval-0', 'with_skill', 'grading.json'), {
    summary: { passed: 2, failed: 1, total: 3, pass_rate: 0.6667 },
    expectations: [{ text: 'x', passed: true, evidence: 'e' }],
  });
  await writeJson(path.join(dir, 'eval-0', 'with_skill', 'execution.json'), {
    run_number: 1,
    total_tokens: 100,
    total_duration_seconds: 2.5,
    total_tool_calls: 4,
    errors_encountered: 0,
  });
  await writeFile(path.join(dir, 'eval-0', 'with_skill', 'outputs', 'a.txt'), 'hello');
  await writeJson(path.join(dir, 'eval-0', 'without_skill', 'grading.json'), {
    summary: { passed: 0, failed: 2, total: 2, pass_rate: 0 },
    expectations: [{ text: 'x', passed: false, evidence: 'e' }],
  });
  await writeJson(path.join(dir, 'eval-0', 'without_skill', 'execution.json'), {
    run_number: 1,
    total_tokens: 50,
    total_duration_seconds: 1.2,
    total_tool_calls: 2,
    errors_encountered: 1,
  });
  await writeFile(path.join(dir, 'eval-0', 'without_skill', 'outputs', 'b.txt'), 'base');
}

test('CLI validate accepts valid skill', async () => {
  await withTempDir(async (dir) => {
    const skillDir = await makeValidSkill(dir);
    const result = await runCli(['validate', skillDir]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Skill is valid/);
  });
});

test('CLI validate rejects invalid skill with --json', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'SKILL.md'), '---\ndescription: no name\n---\n\nBody\n');
    const result = await runCli(['validate', '--json', dir]);
    assert.equal(result.code, 1);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.valid, false);
  });
});

test('CLI benchmark generates JSON and Markdown', async () => {
  await withTempDir(async (dir) => {
    await makeWorkspace(dir);
    const result = await runCli(['benchmark', dir, '--skill-name', 'sample']);
    assert.equal(result.code, 0, result.stderr);
    assert.ok(result.stdout.includes('benchmark.json'));
    const benchmark = JSON.parse(await readFileSafe(path.join(dir, 'benchmark.json')));
    assert.deepEqual(benchmark.metadata.evals_run, ['eval-0']);
    assert.ok(benchmark.run_summary.delta.pass_rate.startsWith('+'));
    const md = await readFileSafe(path.join(dir, 'benchmark.md'));
    assert.match(md, /# Skill Benchmark: sample/);
  });
});

test('CLI review serves page and saves feedback', async () => {
  await withTempDir(async (dir) => {
    await makeWorkspace(dir);
    const child = spawn(process.execPath, [CLI, 'review', dir, '--port', '0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      const url = await waitForUrl(child);
      const page = await fetch(url);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /Eval Review/);

      const post = await fetch(`${url}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviews: [{ run_id: 'eval-0-with_skill', feedback: 'good', timestamp: new Date().toISOString() }],
          status: 'complete',
        }),
      });
      assert.equal(post.status, 200);

      const feedback = JSON.parse(await readFileSafe(path.join(dir, 'feedback.json')));
      assert.equal(feedback.reviews[0].feedback, 'good');
    } finally {
      child.kill();
    }
  });
});

function waitForUrl(child) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for review URL. Output: ${buffer}`));
    }, 8000);
    const onData = (chunk) => {
      buffer += chunk;
      const match = /http:\/\/localhost:(\d+)/.exec(buffer);
      if (match) {
        cleanup();
        resolve(`http://localhost:${match[1]}`);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    function cleanup() {
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
    }
  });
}

async function readFileSafe(file) {
  const { readFile } = await import('node:fs/promises');
  return readFile(file, 'utf8');
}
