// validate subcommand.

import { parseOptions } from '../args.mjs';
import { validateSkill } from '../validate.mjs';

const OPTIONS = [
  { name: '--help', alias: '-h', type: 'boolean' },
  { name: '--json', type: 'boolean' },
];

export function validateHelp() {
  return `Usage: dsh-skill-creator validate <skill-directory> [--json]

Validate a DSH SKILL.md file. Returns exit code 0 when valid.
Options:
  --json   Print the validation result as JSON.
  -h, --help  Show this help.`;
}

export async function runValidate(argv) {
  const parsed = parseOptions(argv, OPTIONS);
  if (parsed.options['--help']) {
    console.log(validateHelp());
    return 0;
  }
  if (parsed.positional.length !== 1) {
    throw new Error(`Expected one skill directory.\n${validateHelp()}`);
  }

  const result = await validateSkill(parsed.positional[0]);
  if (parsed.options['--json']) {
    console.log(JSON.stringify(result, null, 2));
    return result.valid ? 0 : 1;
  }

  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }
  if (result.valid) {
    console.log('Skill is valid!');
    return 0;
  }

  for (const error of result.errors) {
    console.error(`Error: ${error}`);
  }
  return 1;
}
