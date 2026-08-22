// Package-owned invariant companion for @the-heart-fickle/dsh-skill-creator.

const PACKAGE_NAME = '@the-heart-fickle/dsh-skill-creator';

/** Cordis companion plugin name. */
export const name = 'dsh-skill-creator-invariant';

/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];

/**
 * No runtime invariant: the package owns one immutable skill provider
 * registration, while the skill registry owns registration uniqueness and
 * lifecycle checks.
 */
const install = () => { };

/**
 * Register this package's invariant companion.
 *
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
