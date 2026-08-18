// Shared run discovery and output hydration for benchmark/review.

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listEntries, pathExists, readJson, fileSize } from './fs.mjs';

export const EMBED_LIMIT_BYTES = 2 * 1024 * 1024;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  'skill',
  'inputs',
  '.dsh-skill-creator-tmp',
]);

const METADATA_FILES = new Set([
  'transcript.md',
  'user_notes.md',
  'metrics.json',
  'execution.json',
  'grading.json',
  'eval_metadata.json',
]);

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.csv', '.py', '.js', '.mjs', '.ts', '.tsx', '.jsx',
  '.yaml', '.yml', '.xml', '.html', '.css', '.sh', '.rb', '.go', '.rs',
  '.java', '.c', '.cpp', '.h', '.hpp', '.sql', '.r', '.toml', '.ini', '.log',
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

export function outputType(ext) {
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  return 'binary';
}

const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

export function outputMime(type, ext) {
  if (type === 'text') return 'text/plain; charset=utf-8';
  if (type === 'image') return IMAGE_MIME[ext] || 'application/octet-stream';
  if (type === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function fallbackEvalId(root, runDir) {
  const relativeParts = path.relative(root, runDir).split(path.sep);
  const evalPart = relativeParts.find((part) => /^eval[-_]/i.test(part));
  return evalPart || relativeParts[relativeParts.length - 1] || 'unknown';
}

async function findNearestMetadata(root, startDir) {
  let current = path.resolve(startDir);
  const rootResolved = path.resolve(root);
  while (true) {
    const metadata = await readJson(path.join(current, 'eval_metadata.json'));
    if (metadata) return metadata;
    if (current === rootResolved) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return {};
}

async function listOutputs(outputsDir) {
  const entries = await listEntries(outputsDir);
  const files = entries
    .filter((entry) => entry.isFile() && !METADATA_FILES.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const outputs = [];
  for (const entry of files) {
    const filePath = path.join(outputsDir, entry.name);
    const ext = path.extname(entry.name).toLowerCase();
    outputs.push({
      name: entry.name,
      ext,
      type: outputType(ext),
      size: await fileSize(filePath),
    });
  }
  return outputs;
}

/**
 * Recursively find every run directory under workspace.
 *
 * A run directory is any directory containing an `outputs/` folder.
 *
 * @param {string} workspace
 * @returns {Promise<Array<object>>}
 */
export async function findRuns(workspace) {
  const root = path.resolve(workspace);
  const runs = [];

  async function walk(current) {
    const entries = await listEntries(current);
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (pathExists(path.join(full, 'outputs'))) {
        const run = await buildRun(root, full);
        if (run) runs.push(run);
      } else {
        await walk(full);
      }
    }
  }

  await walk(root);
  runs.sort(compareRuns);
  return runs;
}

/**
 * Build a run object from a run directory path.
 *
 * @param {string} root workspace root used to derive ids
 * @param {string} runDir absolute path to the run directory
 */
export async function buildRun(root, runDir) {
  const outputsDir = path.join(runDir, 'outputs');
  if (!pathExists(outputsDir)) return null;

  const relativeParts = path.relative(root, runDir).split(path.sep);
  const id = relativeParts.join('-');
  const lastPart = relativeParts[relativeParts.length - 1] || '';
  const configuration = /^run[-_]/i.test(lastPart)
    ? relativeParts[relativeParts.length - 2] || lastPart
    : lastPart;

  const metadata =
    (await readJson(path.join(runDir, 'eval_metadata.json'))) ||
    (await findNearestMetadata(root, path.dirname(runDir))) ||
    {};
  const evalId =
    typeof metadata.eval_id === 'string' && metadata.eval_id
      ? metadata.eval_id
      : fallbackEvalId(root, runDir);
  const evalName = metadata.eval_name || `Eval ${evalId}`;
  const prompt = metadata.prompt || '(No prompt found)';

  const execution = (await readJson(path.join(runDir, 'execution.json'))) || {};
  const runNumber = Number.isInteger(execution.run_number)
    ? execution.run_number
    : runNumberFromDir(lastPart);

  const grading = (await readJson(path.join(runDir, 'grading.json'))) || null;

  return {
    id,
    dir: runDir,
    outputsDir,
    eval_id: evalId,
    eval_name: evalName,
    configuration,
    run_number: runNumber,
    prompt,
    outputs: await listOutputs(outputsDir),
    grading,
    execution,
  };
}

function runNumberFromDir(dirName) {
  const match = /^run[-_](\d+)$/i.exec(dirName);
  return match ? Number(match[1]) : 1;
}

export function compareRuns(a, b) {
  return a.eval_id.localeCompare(b.eval_id) || a.id.localeCompare(b.id);
}

export function outputUrl(runId, name, scope = 'current') {
  const params = new URLSearchParams({ run: runId, name, scope });
  return `/api/files?${params.toString()}`;
}

/**
 * Hydrate output metadata with either embedded content (small files) or a
 * server URL (large files). Local paths are intentionally not returned.
 *
 * @param {object} run
 * @param {'current'|'previous'} [scope]
 * @returns {Promise<Array<object>>}
 */
export async function hydrateOutputs(run, scope = 'current') {
  return Promise.all(
    run.outputs.map(async (output) => {
      if (output.size > EMBED_LIMIT_BYTES) {
        return { ...output, url: outputUrl(run.id, output.name, scope) };
      }

      const filePath = path.join(run.outputsDir, output.name);
      if (output.type === 'text') {
        const content = await readFile(filePath, 'utf8').catch(() => '(Error reading file)');
        return { ...output, content };
      }

      const raw = await readFile(filePath).catch(() => null);
      if (!raw) return { ...output, content: null };
      const mime = outputMime(output.type, output.ext);
      return { ...output, content: `data:${mime};base64,${raw.toString('base64')}` };
    })
  );
}

/**
 * Strip internal paths from a run before sending it to the browser.
 */
export function toPublicRun(run) {
  return {
    id: run.id,
    eval_id: run.eval_id,
    eval_name: run.eval_name,
    configuration: run.configuration,
    run_number: run.run_number,
    prompt: run.prompt,
    grading: run.grading,
  };
}
