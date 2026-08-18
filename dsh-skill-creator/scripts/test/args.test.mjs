import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions } from '../lib/args.mjs';

const DEFINITIONS = [
  { name: '--port', alias: '-p', type: 'number' },
  { name: '--json', type: 'boolean' },
  { name: '--name', type: 'string' },
];

test('parseOptions parses positionals and flags', () => {
  const parsed = parseOptions(
    ['dir', '--json', '--port', '8080', '--name=foo'],
    DEFINITIONS
  );
  assert.deepEqual(parsed.positional, ['dir']);
  assert.equal(parsed.options['--json'], true);
  assert.equal(parsed.options['--port'], 8080);
  assert.equal(parsed.options['--name'], 'foo');
});

test('parseOptions supports short aliases and = syntax', () => {
  const parsed = parseOptions(['-p', '3117', '--json=true'], DEFINITIONS);
  assert.equal(parsed.options['--port'], 3117);
  assert.equal(parsed.options['--json'], true);
});

test('parseOptions treats non-option args as positional', () => {
  const parsed = parseOptions(['--', '--json', 'x'], DEFINITIONS);
  assert.deepEqual(parsed.positional, ['--json', 'x']);
  assert.equal(parsed.options['--json'], undefined);
});

test('parseOptions throws on unknown option', () => {
  assert.throws(() => parseOptions(['--unknown'], DEFINITIONS), /Unknown option/);
});

test('parseOptions throws on missing value', () => {
  assert.throws(() => parseOptions(['--port'], DEFINITIONS), /Missing value/);
});
