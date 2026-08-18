// review subcommand.

import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseOptions } from '../args.mjs';
import { pathExists } from '../fs.mjs';
import { findRuns } from '../runs.mjs';
import { createReviewServer, loadPreviousIteration } from '../review.mjs';

const OPTIONS = [
  { name: '--port', alias: '-p', type: 'number' },
  { name: '--skill-name', alias: '-n', type: 'string' },
  { name: '--previous', type: 'string' },
  { name: '--benchmark', type: 'string' },
  { name: '--help', alias: '-h', type: 'boolean' },
];

export function reviewHelp() {
  return `Usage: dsh-skill-creator review <workspace> [options]

Start a local review server for eval runs.

Options:
  -p, --port <port>          Port to listen on (default: 3117).
  -n, --skill-name <name>    Skill name shown in the page header.
  --previous <dir>           Previous workspace for comparison.
  --benchmark <path>         Benchmark JSON path (default: <workspace>/benchmark.json).
  -h, --help                 Show this help.`;
}

function openBrowser(url) {
  const platform = process.platform;
  let command;
  let args;
  if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Ignore browser-open failures; the URL is printed for manual use.
  }
}

export async function runReview(argv) {
  const parsed = parseOptions(argv, OPTIONS);
  if (parsed.options['--help']) {
    console.log(reviewHelp());
    return 0;
  }
  if (parsed.positional.length !== 1) {
    throw new Error(`Expected one workspace directory.\n${reviewHelp()}`);
  }

  const workspace = path.resolve(parsed.positional[0]);
  if (!pathExists(workspace)) {
    throw new Error(`Error: ${workspace} is not a directory`);
  }

  const runs = await findRuns(workspace);
  if (runs.length === 0) {
    throw new Error(`No runs found in ${workspace}`);
  }

  const skillName = parsed.options['--skill-name'] || path.basename(workspace).replace(/-workspace$/, '');
  const feedbackPath = path.join(workspace, 'feedback.json');
  const previous = parsed.options['--previous']
    ? await loadPreviousIteration(path.resolve(parsed.options['--previous']))
    : { feedback: {}, runs: [] };
  const benchmarkPath = parsed.options['--benchmark']
    ? path.resolve(parsed.options['--benchmark'])
    : path.join(workspace, 'benchmark.json');
  const benchmark = pathExists(benchmarkPath) ? benchmarkPath : null;

  const server = createReviewServer({
    runs,
    previous,
    feedbackPath,
    skillName,
    benchmarkPath: benchmark,
  });

  const port = parsed.options['--port'] ?? 3117;
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const alt = createReviewServer({
        runs,
        previous,
        feedbackPath,
        skillName,
        benchmarkPath: benchmark,
      });
      alt.listen(0, '127.0.0.1', () => {
        const altPort = alt.address().port;
        const url = `http://localhost:${altPort}`;
        console.log(`Port ${port} is in use; using ${url}`);
        openBrowser(url);
      });
    } else {
      console.error(err.message);
      process.exit(1);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    const actualPort = server.address().port;
    const url = `http://localhost:${actualPort}`;
    console.log('');
    console.log('  Eval Viewer');
    console.log('  ------------------------------------------------');
    console.log(`  URL:       ${url}`);
    console.log(`  Workspace: ${workspace}`);
    console.log(`  Feedback:  ${feedbackPath}`);
    if (parsed.options['--previous']) console.log(`  Previous:  ${parsed.options['--previous']}`);
    if (benchmark) console.log(`  Benchmark: ${benchmark}`);
    console.log('\n  Press Ctrl+C to stop.\n');
    openBrowser(url);
  });

  // The server handle keeps the event loop alive.
  return 0;
}
