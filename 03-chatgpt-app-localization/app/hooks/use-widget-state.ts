/**
 * Source: https://github.com/openai/openai-apps-sdk-examples/tree/main/src
 */

import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { useOpenAIGlobal } from "./use-openai-global";
import type { UnknownObject } from "./types";

export function useWidgetState<T extends UnknownObject>(
  defaultState: T | (() => T)
): readonly [T, (state: SetStateAction<T>) => void];

export function useWidgetState<T extends UnknownObject>(
  defaultState?: T | (() => T | null) | null
): readonly [T | null, (state: SetStateAction<T | null>) => void];

/**
 * Hook to manage widget state that persists across widget lifecycles.
 * State is synchronized with the ChatGPT parent window and survives widget minimize/restore.
 * 
 * - Safe on SSR (no window access during render)
 * - Works without window.openai (local dev fallback)
 */
export function useWidgetState<T extends UnknownObject>(
  defaultState?: T | (() => T | null) | null
): readonly [T | null, (state: SetStateAction<T | null>) => void] {
  const widgetStateFromWindow = useOpenAIGlobal("widgetState") as T | null;

  const [widgetState, _setWidgetState] = useState<T | null>(() => {
    if (widgetStateFromWindow != null) {
      return widgetStateFromWindow;
    }
    return typeof defaultState === "function"
      ? (defaultState as () => T | null)()
      : defaultState ?? null;
  });

  // Sync incoming updates from host
  useEffect(() => {
    if (widgetStateFromWindow === undefined) return;
    _setWidgetState(widgetStateFromWindow);
  }, [widgetStateFromWindow]);

  const setWidgetState = useCallback(
    (updater: SetStateAction<T | null>) => {
      _setWidgetState((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (prev: T | null) => T | null)(prev)
            : updater;

        // Try to propagate to host if available
        if (typeof window !== "undefined" && next != null) {
          const setter = window?.openai?.setWidgetState;
          if (typeof setter === "function") {
            try {
              void setter(next as any);
            } catch {
              // fall back silently
            }
          }
        }
        return next;
      });
    },
    []
  );

  return [widgetState, setWidgetState] as const;
}