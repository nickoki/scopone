/**
 * The single place that decides whether a feature is available to this player.
 *
 * Everything is unlocked today. If these features move behind a paid plan,
 * this is the only function that has to learn about purchases: the UI already
 * asks it before computing an analysis, showing a score or opening a review,
 * and shows a "locked" state wherever it answers false.
 */
export type PremiumFeature =
  /** The accuracy score shown after each hand. */
  | 'accuracy'
  /** The move-by-move review with the better moves and the reasons. */
  | 'review';

export function isUnlocked(feature: PremiumFeature): boolean {
  // For testing the locked screens before a paywall exists: set
  // `window.__scoponeLocked = ['review']` (or 'accuracy') in the browser console.
  const locked = (globalThis as { __scoponeLocked?: readonly string[] }).__scoponeLocked;
  return !(Array.isArray(locked) && locked.includes(feature));
}
