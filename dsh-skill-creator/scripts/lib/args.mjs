// Minimal CLI argument parser used by the unified dsh-skill-creator CLI.

/**
 * Parse argv against a list of option definitions.
 *
 * @param {string[]} argv
 * @param {Array<{name: string, alias?: string, type: 'boolean'|'string'|'number'}>} definitions
 * @returns {{ positional: string[], options: Record<string, string|number|boolean> }}
 */
export function parseOptions(argv, definitions) {
  const byName = new Map();
  const byAlias = new Map();
  for (const def of definitions) {
    byName.set(def.name, def);
    if (def.alias) byAlias.set(def.alias, def);
  }

  const result = { positional: [], options: {} };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      result.positional.push(...argv.slice(i + 1));
      break;
    }

    let name = arg;
    let inlineValue;
    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq !== -1) {
      name = arg.slice(0, eq);
      inlineValue = arg.slice(eq + 1);
    }

    const def = byName.get(name) || byAlias.get(name);
    if (!def) {
      if (arg.startsWith('-') && arg !== '-') {
        throw new Error(`Unknown option: ${arg}`);
      }
      result.positional.push(arg);
      continue;
    }

    if (def.type === 'boolean') {
      result.options[def.name] = inlineValue === undefined ? true : inlineValue === 'true';
      continue;
    }

    let value = inlineValue;
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined) {
        throw new Error(`Missing value for ${def.name}`);
      }
    }

    if (def.type === 'number') {
      const num = Number(value);
      if (Number.isNaN(num)) {
        throw new Error(`Invalid number for ${def.name}: ${value}`);
      }
      value = num;
    }

    result.options[def.name] = value;
  }

  return result;
}
