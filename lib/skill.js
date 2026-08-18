// Bundled skill provider for the dsh-skill-creator plugin.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const PROVIDER_NAME = 'dsh-skill-creator';

/** Standard precedence rank for packaged skill providers (matches @deepseek-ai/dsh-skill). */
const BUNDLED_SKILL_RANK = 600;

const SKILL_DIR_URL = new URL('../dsh-skill-creator/', import.meta.url);
const SKILL_BODY_URL = new URL('../dsh-skill-creator/SKILL.md', import.meta.url);
const SKILL_DIR_PATH = fileURLToPath(SKILL_DIR_URL);
const SKILL_BODY_PATH = fileURLToPath(SKILL_BODY_URL);

const RESOURCE_BASE = {
  kind: 'directory',
  path: SKILL_DIR_PATH,
};

/**
 * Parse the simple YAML frontmatter used by this project's SKILL.md.
 * Only the scalar fields needed for skill registration are extracted; the
 * rest of the frontmatter is ignored.
 *
 * @param {string} raw
 * @returns {{ name: string, description: string, whenToUse?: string, content: string }}
 */
export function parseSkillFrontmatter(raw) {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    throw new Error('SKILL.md must start with "---"');
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closingIndex === -1) {
    throw new Error('SKILL.md has no closing "---"');
  }

  const values = {};
  for (const line of lines.slice(1, closingIndex)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) continue;

    const key = match[1];
    let value = (match[2] ?? '').trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  const name = values.name;
  const description = values.description;
  if (typeof name !== 'string' || name === '') {
    throw new Error('SKILL.md frontmatter requires a non-empty "name"');
  }
  if (typeof description !== 'string' || description === '') {
    throw new Error('SKILL.md frontmatter requires a non-empty "description"');
  }

  const content = lines.slice(closingIndex + 1).join('\n').trim();
  return {
    name,
    description,
    whenToUse: typeof values.whenToUse === 'string' ? values.whenToUse : undefined,
    content,
  };
}

let cachedDefinition;

async function loadSkillDefinition() {
  if (cachedDefinition) return cachedDefinition;
  const raw = await readFile(SKILL_BODY_URL, 'utf8');
  const parsed = parseSkillFrontmatter(raw);
  cachedDefinition = parsed;
  return cachedDefinition;
}

/**
 * Create the skill provider registered by this plugin.
 *
 * @returns {import('@deepseek-ai/dsh-skill').SkillProvider}
 */
export function createProvider() {
  return {
    name: PROVIDER_NAME,
    async list() {
      const skill = await loadSkillDefinition();
      return [{
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse ? { whenToUse: skill.whenToUse } : {}),
        invocation: { modelInvocable: true, userInvocable: true },
        provider: PROVIDER_NAME,
        source: 'bundled',
        resourceBase: RESOURCE_BASE,
        rank: BUNDLED_SKILL_RANK,
        locator: SKILL_BODY_URL,
        path: SKILL_BODY_PATH,
      }];
    },
    async get() {
      const skill = await loadSkillDefinition();
      return {
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse ? { whenToUse: skill.whenToUse } : {}),
        invocation: { modelInvocable: true, userInvocable: true },
        provider: PROVIDER_NAME,
        source: 'bundled',
        resourceBase: RESOURCE_BASE,
        content: skill.content,
        path: SKILL_BODY_PATH,
      };
    },
  };
}
