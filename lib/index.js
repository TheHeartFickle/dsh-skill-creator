// Cordis plugin entry for @the-heart-fickle/dsh-skill-creator-plugin.

import { createProvider } from './skill.js';

/** Cordis plugin name. */
export const name = 'dsh-skill-creator';

/** Service required by the bundled provider. */
export const inject = ['skills'];

/** Register the bundled dsh-skill-creator provider on ctx.skills. */
export function apply(ctx) {
  return ctx.skills.registerProvider(() => createProvider());
}
