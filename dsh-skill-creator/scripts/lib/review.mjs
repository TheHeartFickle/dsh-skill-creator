// Review page rendering and local HTTP server.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathExists, readJson } from './fs.mjs';
import { findRuns, hydrateOutputs, outputMime } from './runs.mjs';

const MAX_FEEDBACK_BODY_BYTES = 1024 * 1024;

function escapeScript(str) {
  return String(str).replace(/</g, '\\u003c');
}

export function renderHtml(data) {
  const embedded = escapeScript(JSON.stringify(data));
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Eval Review</title>
<style>
  :root {
    --bg: #f5f6f8; --surface: #fff; --border: #e0e3e8; --text: #1f2328;
    --muted: #6a737d; --accent: #2f81f7; --green: #1a7f37; --red: #cf222e;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
  header { background: #111; color: #fff; padding: 16px 24px; display: flex; align-items: center; gap: 16px; }
  header h1 { font-size: 18px; margin: 0; }
  nav button { background: none; border: none; color: #ddd; font-size: 14px; padding: 8px 12px; cursor: pointer; }
  nav button.active { color: #fff; border-bottom: 2px solid var(--accent); }
  main { max-width: 1200px; margin: 24px auto; padding: 0 24px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .run-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .badge { font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 999px; }
  .badge.with_skill { background: #ddf4ff; color: #0969da; }
  .badge.without_skill, .badge.old_skill { background: #fff8c5; color: #7d4e00; }
  .prompt { white-space: pre-wrap; background: #f6f8fa; border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin: 8px 0; }
  .file { border: 1px solid var(--border); border-radius: 6px; margin: 8px 0; }
  .file summary { cursor: pointer; padding: 8px 12px; background: #f6f8fa; font-weight: 600; }
  pre { margin: 0; padding: 12px; overflow: auto; max-height: 480px; white-space: pre-wrap; word-break: break-word; }
  img { max-width: 100%; display: block; }
  iframe { width: 100%; height: 600px; border: 0; }
  .grade { font-size: 13px; }
  .pass { color: var(--green); font-weight: 600; }
  .fail { color: var(--red); font-weight: 600; }
  textarea { width: 100%; min-height: 64px; font: inherit; padding: 8px; border: 1px solid var(--border); border-radius: 6px; }
  button.primary { background: var(--accent); color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .saved { color: var(--green); margin-left: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { border: 1px solid var(--border); padding: 8px 10px; text-align: left; }
  th { background: #f6f8fa; }
  .muted { color: var(--muted); }
  .hide { display: none; }
</style>
</head>
<body>
<header>
  <h1>Eval Review${data.skill_name ? ' — ' + data.skill_name : ''}</h1>
  <nav>
    <button id="tab-outputs" class="active" onclick="switchTab('outputs')">Outputs</button>
    <button id="tab-benchmark" onclick="switchTab('benchmark')">Benchmark</button>
  </nav>
</header>
<main>
  <div id="outputs-tab">
    <p class="muted">逐个查看输出并在文本框留下反馈。完成后点击“提交反馈”，数据会保存到 workspace 的 feedback.json。</p>
    <div id="runs"></div>
    <button class="primary" onclick="submitFeedback()">提交反馈</button><span id="saved" class="saved"></span>
  </div>
  <div id="benchmark-tab" class="hide"></div>
</main>
<script>
const DATA = ${embedded};
const runsEl = document.getElementById('runs');

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderOutput(file) {
  if (file.url) {
    return '<p><a href="' + escapeHtml(file.url) + '" target="_blank" rel="noopener">打开 ' + escapeHtml(file.name) + ' (' + formatSize(file.size) + ')</a></p>';
  }
  if (file.type === 'text') {
    return '<pre>' + escapeHtml(file.content) + '</pre>';
  }
  if (file.type === 'image') {
    return '<img src="' + escapeHtml(file.content) + '" alt="' + escapeHtml(file.name) + '">';
  }
  if (file.type === 'pdf') {
    return '<iframe src="' + escapeHtml(file.content) + '"></iframe>';
  }
  return '<p><a href="' + escapeHtml(file.content) + '" download="' + escapeHtml(file.name) + '">下载 ' + escapeHtml(file.name) + '</a></p>';
}

function renderGrading(grading) {
  if (!grading) return '<p class="muted">暂无正式评分。</p>';
  const rows = (grading.expectations || []).map((e) => {
    const cls = e.passed ? 'pass' : 'fail';
    const mark = e.passed ? 'PASS' : 'FAIL';
    return '<div class="grade"><span class="' + cls + '">' + mark + '</span> ' + escapeHtml(e.text) + '<br><span class="muted">证据：' + escapeHtml(e.evidence) + '</span></div>';
  }).join('');
  return '<details><summary>Formal Grades</summary>' + rows + '</details>';
}

function renderRuns() {
  runsEl.innerHTML = DATA.runs.map((run) => {
    const prevOutput = (DATA.previous_outputs || {})[run.id] || [];
    const prevFeedback = (DATA.previous_feedback || {})[run.id] || '';
    const files = run.outputs.map((f) => '<div class="file"><details><summary>' + escapeHtml(f.name) + '</summary>' + renderOutput(f) + '</details></div>').join('');
    const prevHtml = prevOutput.length || prevFeedback
      ? '<details><summary>Previous Output / Feedback</summary><p class="muted">' + escapeHtml(prevFeedback) + '</p>' + prevOutput.map((f) => '<div class="file"><details><summary>' + escapeHtml(f.name) + '</summary>' + renderOutput(f) + '</details></div>').join('') + '</details>'
      : '';
    const feedback = (DATA.feedback || {})[run.id] || '';
    return '<div class="card">' +
      '<div class="run-head"><h3>' + escapeHtml(run.eval_name || ('Eval ' + run.eval_id)) + '</h3><span class="badge ' + escapeHtml(run.configuration || '') + '">' + escapeHtml(run.configuration || '') + '</span></div>' +
      '<div class="prompt">' + escapeHtml(run.prompt) + '</div>' +
      files +
      renderGrading(run.grading) +
      prevHtml +
      '<textarea data-run-id="' + escapeHtml(run.id) + '" placeholder="对这个 run 的反馈（留空表示没问题）">' + escapeHtml(feedback) + '</textarea>' +
      '</div>';
  }).join('');
}

async function submitFeedback() {
  const reviews = Array.from(document.querySelectorAll('textarea[data-run-id]')).map((t) => ({
    run_id: t.getAttribute('data-run-id'),
    feedback: t.value,
    timestamp: new Date().toISOString(),
  }));
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviews, status: 'complete' }),
  });
  const saved = document.getElementById('saved');
  saved.textContent = res.ok ? '已保存 feedback.json' : '保存失败';
}

function switchTab(name) {
  document.getElementById('outputs-tab').classList.toggle('hide', name !== 'outputs');
  document.getElementById('benchmark-tab').classList.toggle('hide', name !== 'benchmark');
  document.getElementById('tab-outputs').classList.toggle('active', name === 'outputs');
  document.getElementById('tab-benchmark').classList.toggle('active', name === 'benchmark');
  if (name === 'benchmark') renderBenchmark();
}

function renderBenchmark() {
  const el = document.getElementById('benchmark-tab');
  if (!DATA.benchmark) {
    el.innerHTML = '<p class="muted">没有 benchmark 数据。请先运行 dsh-skill-creator benchmark。</p>';
    return;
  }
  const b = DATA.benchmark;
  const configs = Object.keys(b.run_summary || {}).filter((k) => k !== 'delta');
  const delta = (b.run_summary && b.run_summary.delta) || {};
  const row = (label, a, bval, d) => '<tr><td>' + label + '</td><td>' + (a || '—') + '</td><td>' + (bval || '—') + '</td><td>' + (d || '—') + '</td></tr>';
  const stats = (s) => s ? Math.round((s.mean || 0) * 100) + '% ± ' + Math.round((s.stddev || 0) * 100) + '%' : '—';
  const statsT = (s) => s ? (s.mean || 0).toFixed(1) + 's ± ' + (s.stddev || 0).toFixed(1) + 's' : '—';
  const statsN = (s) => s ? Math.round(s.mean || 0) + ' ± ' + Math.round(s.stddev || 0) : '—';
  const a = configs[0] ? b.run_summary[configs[0]] : {};
  const c = configs[1] ? b.run_summary[configs[1]] : {};
  el.innerHTML = '<h2>Benchmark</h2><table><thead><tr><th>Metric</th><th>' + escapeHtml(configs[0] || 'Config A') + '</th><th>' + escapeHtml(configs[1] || 'Config B') + '</th><th>Delta</th></tr></thead><tbody>' +
    row('Pass Rate', stats(a.pass_rate), stats(c.pass_rate), delta.pass_rate) +
    row('Time', statsT(a.time_seconds), statsT(c.time_seconds), delta.time_seconds) +
    row('Tokens', statsN(a.tokens), statsN(c.tokens), delta.tokens) +
    '</tbody></table>';
}

renderRuns();
</script>
</body>
</html>`;
}

export async function loadFeedbackMap(feedbackPath) {
  const feedback = await readJson(feedbackPath);
  const map = {};
  for (const review of feedback?.reviews || []) {
    if (review.run_id) map[review.run_id] = review.feedback || '';
  }
  return map;
}

export async function loadPreviousIteration(previousDir) {
  const runs = await findRuns(previousDir);
  const feedback = await loadFeedbackMap(path.join(previousDir, 'feedback.json'));
  return { feedback, runs };
}

async function hydrateRunForView(run) {
  const outputs = await hydrateOutputs(run, 'current');
  return {
    id: run.id,
    eval_id: run.eval_id,
    eval_name: run.eval_name,
    configuration: run.configuration,
    run_number: run.run_number,
    prompt: run.prompt,
    grading: run.grading,
    outputs,
  };
}

export function createReviewServer({ runs, previous, feedbackPath, skillName, benchmarkPath }) {
  const runsById = new Map();
  for (const run of runs) runsById.set(`current:${run.id}`, run);
  for (const run of previous.runs) runsById.set(`previous:${run.id}`, run);

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const viewRuns = await Promise.all(runs.map(hydrateRunForView));
        const previousOutputs = {};
        for (const run of previous.runs) {
          previousOutputs[run.id] = await hydrateOutputs(run, 'previous');
        }
        const data = {
          skill_name: skillName,
          runs: viewRuns,
          feedback: await loadFeedbackMap(feedbackPath),
          previous_feedback: previous.feedback,
          previous_outputs: previousOutputs,
          benchmark: benchmarkPath ? await readJson(benchmarkPath) : null,
        };
        const html = Buffer.from(renderHtml(data), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/feedback') {
        const body = pathExists(feedbackPath) ? await readFile(feedbackPath) : Buffer.from('{}');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(body);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/feedback') {
        let raw = '';
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_FEEDBACK_BODY_BYTES) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Feedback payload too large' }));
            return;
          }
          raw += chunk;
        }
        let data;
        try {
          data = JSON.parse(raw);
          if (!data || !Array.isArray(data.reviews)) {
            throw new Error('Expected JSON object with reviews array');
          }
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
        await writeFile(feedbackPath, JSON.stringify(data, null, 2) + '\n');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/files') {
        const runId = url.searchParams.get('run');
        const name = url.searchParams.get('name');
        const scope = url.searchParams.get('scope') || 'current';
        const run = runId ? runsById.get(`${scope}:${runId}`) : null;
        const output = run?.outputs.find((item) => item.name === name);
        if (!run || !output) {
          res.writeHead(404);
          res.end('File not found');
          return;
        }
        const filePath = path.join(run.outputsDir, output.name);
        const mime = outputMime(output.type, output.ext);
        const inline = output.type === 'text' || output.type === 'image' || output.type === 'pdf';
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(output.name)}"`,
        });
        createReadStream(filePath).pipe(res);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Error: ${err.message}`);
    }
  });
}
