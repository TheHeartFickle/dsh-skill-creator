// Lightweight SKILL.md validation for the DSH skill format.

import path from 'node:path';
import { pathExists, readText } from './fs.mjs';

export const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_NAME_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 1024;
export const MAX_SKILL_LINES = 500;

/**
 * Parse the simple top-level YAML subset used by DSH SKILL.md frontmatter.
 *
 * Supported: scalar values, quoted strings, empty values, and indented
 * block content (block scalars / nested maps are treated as "present" but
 * are not deeply parsed).
 *
 * @param {string} text
 * @returns {{ values: Record<string, string>, errors: string[] }}
 */
export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  const values = {};
  const errors = [];
  let currentKey = null;
  let inBlock = false;

  for (const rawLine of lines) {
    if (rawLine.trim() === '' || rawLine.trimStart().startsWith('#')) continue;

    const indent = rawLine.match(/^\s*/)[0].length;
    const line = rawLine.trim();

    if (indent > 0) {
      if (currentKey !== null) {
        if (!inBlock) inBlock = true;
        if (line && values[currentKey] === '') values[currentKey] = ' ';
      }
      continue;
    }

    inBlock = false;
    currentKey = null;
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      errors.push(`Unsupported frontmatter line: ${rawLine}`);
      continue;
    }

    const key = match[1];
    let value = (match[2] ?? '').trim();
    currentKey = key;

    if (value === '' || value === '|' || value === '>') {
      values[key] = '';
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return { values, errors };
}

/**
 * Validate a skill directory's SKILL.md against DSH rules.
 *
 * @param {string} skillPath
 * @returns {Promise<{ valid: boolean, errors: string[], warnings: string[] }>}
 */
export async function validateSkill(skillPath) {
  const errors = [];
  const warnings = [];

  const skillDir = path.resolve(skillPath);
  if (!pathExists(skillDir)) {
    return { valid: false, errors: [`Directory not found: ${skillPath}`], warnings };
  }

  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!pathExists(skillMd)) {
    return { valid: false, errors: ['SKILL.md not found'], warnings };
  }

  let content;
  try {
    content = await readText(skillMd);
  } catch (err) {
    return { valid: false, errors: [`Cannot read SKILL.md: ${err.message}`], warnings };
  }

  if (!content.startsWith('---')) {
    errors.push('SKILL.md must start with YAML frontmatter delimiter "---"');
  }

  const lines = content.split(/\r?\n/);
  const closingIndex = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (closingIndex === -1) {
    errors.push('No closing "---" found for YAML frontmatter');
    return { valid: errors.length === 0, errors, warnings };
  }

  const frontmatterText = lines.slice(1, closingIndex).join('\n');
  const body = lines.slice(closingIndex + 1).join('\n').trim();

  if (!body) {
    errors.push('SKILL.md body is empty after frontmatter');
  }

  const { values: fm, errors: parseErrors } = parseFrontmatter(frontmatterText);
  errors.push(...parseErrors);

  const name = fm.name ?? '';
  if (!name) {
    errors.push("Missing 'name' in frontmatter");
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.push(`name is too long (${name.length} characters). Maximum is ${MAX_NAME_LENGTH}.`);
  } else if (!NAME_RE.test(name)) {
    errors.push(`name '${name}' must match ${NAME_RE}`);
  }

  const description = fm.description ?? '';
  if (!description) {
    errors.push("Missing 'description' in frontmatter");
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description is too long (${description.length} characters). Maximum is ${MAX_DESCRIPTION_LENGTH}.`);
  }

  if (fm.whenToUse !== undefined && typeof fm.whenToUse !== 'string') {
    errors.push('whenToUse must be a string');
  }

  const dirName = path.basename(skillDir);
  if (name && dirName !== name) {
    errors.push(`Directory name '${dirName}' must match frontmatter name '${name}'`);
  }

  if (lines.length > MAX_SKILL_LINES) {
    warnings.push(`SKILL.md is ${lines.length} lines; consider moving details to references/ to stay under ${MAX_SKILL_LINES} lines.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
