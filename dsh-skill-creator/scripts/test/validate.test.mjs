import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseFrontmatter, validateSkill } from '../lib/validate.mjs';

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-validate-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('parseFrontmatter reads scalar and quoted values', () => {
  const { values, errors } = parseFrontmatter(
    'name: my-skill\ndescription: "Does things"\nwhenToUse: some case\n'
  );
  assert.deepEqual(errors, []);
  assert.equal(values.name, 'my-skill');
  assert.equal(values.description, 'Does things');
  assert.equal(values.whenToUse, 'some case');
});

test('parseFrontmatter treats indented blocks as present', () => {
  const { values, errors } = parseFrontmatter(
    'description: >\n  multi\n  line\nmetadata:\n  key: value\n'
  );
  assert.deepEqual(errors, []);
  assert.equal(values.description, ' ');
  assert.equal(values.metadata, ' ');
});

test('parseFrontmatter reports malformed top-level lines', () => {
  const { errors } = parseFrontmatter('not a mapping\nname: ok\n');
  assert.ok(errors.some((error) => error.includes('Unsupported frontmatter line')));
});

test('validateSkill accepts a valid SKILL.md', async () => {
  await withTempDir(async (dir) => {
    const skillDir = path.join(dir, 'test-skill');
    await mkdir(skillDir);
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: test-skill\ndescription: A test skill\n---\n\nBody\n'
    );
    const result = await validateSkill(skillDir);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });
});

test('validateSkill rejects missing name', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'SKILL.md'), '---\ndescription: A test skill\n---\n\nBody\n');
    const result = await validateSkill(dir);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("Missing 'name'")));
  });
});

test('validateSkill rejects directory name mismatch', async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, 'SKILL.md'),
      '---\nname: another-name\ndescription: A test skill\n---\n\nBody\n'
    );
    const result = await validateSkill(dir);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("Directory name")));
  });
});

test('validateSkill warns when SKILL.md is too long', async () => {
  await withTempDir(async (dir) => {
    const skillDir = path.join(dir, 'test-skill');
    await mkdir(skillDir);
    const body = Array.from({ length: 510 }, (_, i) => `line ${i}`).join('\n');
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---\nname: test-skill\ndescription: A test skill\n---\n\n${body}\n`
    );
    const result = await validateSkill(skillDir);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((warning) => warning.includes('SKILL.md is')));
  });
});
