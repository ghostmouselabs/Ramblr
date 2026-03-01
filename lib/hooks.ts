import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Returns `true` on the client after hydration, `false` during SSR.
 *
 * Uses `useSyncExternalStore` which is the React 19 recommended pattern
 * for distinguishing server vs. client renders without triggering
 * cascading re-renders from setState-in-effect.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}
