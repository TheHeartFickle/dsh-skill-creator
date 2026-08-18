// Small filesystem helpers shared by CLI subcommands.

import { existsSync } from 'node:fs';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';

export const pathExists = existsSync;

export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function writeJson(file, data) {
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
}

export async function readText(file) {
  return readFile(file, 'utf8');
}

export async function listEntries(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function fileSize(file) {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}
