import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSkillFrontmatter, createProvider } from '../lib/skill.js';
import * as plugin from '../lib/index.js';
import * as invariant from '../lib/invariant.js';

test('parseSkillFrontmatter extracts metadata and body', () => {
  const raw = `---
name: demo-skill
description: A demo skill for tests.
whenToUse: Use when asked to demo.
---
# Demo

Body content.
`;
  const parsed = parseSkillFrontmatter(raw);
  assert.equal(parsed.name, 'demo-skill');
  assert.equal(parsed.description, 'A demo skill for tests.');
  assert.equal(parsed.whenToUse, 'Use when asked to demo.');
  assert.equal(parsed.content, '# Demo\n\nBody content.');
});

test('parseSkillFrontmatter rejects missing name or description', () => {
  assert.throws(() => parseSkillFrontmatter('---\ndescription: no name\n---\nbody'), /name/);
  assert.throws(() => parseSkillFrontmatter('---\nname: demo\n---\nbody'), /description/);
});

test('createProvider list returns the bundled dsh-skill-creator candidate', async () => {
  const provider = createProvider();
  const candidates = await provider.list();
  assert.equal(candidates.length, 1);
  const [candidate] = candidates;
  assert.equal(candidate.name, 'dsh-skill-creator');
  assert.equal(candidate.provider, 'dsh-skill-creator');
  assert.equal(candidate.source, 'bundled');
  assert.equal(candidate.invocation.modelInvocable, true);
  assert.equal(candidate.invocation.userInvocable, true);
  assert.equal(candidate.resourceBase.kind, 'directory');
  assert.ok(candidate.resourceBase.path.includes('dsh-skill-creator'));
  assert.equal(typeof candidate.rank, 'number');
});

test('createProvider get returns SKILL.md body without frontmatter', async () => {
  const provider = createProvider();
  const [candidate] = await provider.list();
  const definition = await provider.get(candidate);
  assert.equal(definition.name, 'dsh-skill-creator');
  assert.equal(definition.content, (await readFile(new URL('../dsh-skill-creator/SKILL.md', import.meta.url), 'utf8')).split(/^---$/m).slice(2).join('---').trim());
  assert.match(definition.content, /^# DSH Skill Creator/);
});

test('plugin and invariant exports follow the Cordis plugin shape', () => {
  assert.equal(plugin.name, 'dsh-skill-creator');
  assert.deepEqual(plugin.inject, ['skills']);
  assert.equal(typeof plugin.apply, 'function');
  assert.equal(invariant.name, 'dsh-skill-creator-invariant');
  assert.deepEqual(invariant.inject, ['invariants']);
  assert.equal(typeof invariant.apply, 'function');
});
