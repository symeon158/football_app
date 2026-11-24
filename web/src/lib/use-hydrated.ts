"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server rendering and the first hydration pass, true once React owns the page.
 *
 * Forms that use `useActionState` disable their submit button until this is true: a submit made
 * before hydration falls back to a native POST, and with Partial Prerendering Next.js answers that
 * with only the dynamic part of the page (no shell), which shows up as a blank page.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
