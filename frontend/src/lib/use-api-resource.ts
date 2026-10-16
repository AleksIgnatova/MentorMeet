import { useCallback, useEffect, useRef, useState } from 'react';

export type ResourceState<T> =
  | { status: 'loading'; data?: T; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: T; error: unknown };

/**
 * Loads data from the API whenever `deps` change, and on `reload()`.
 * Responses from superseded requests are ignored (and their fetch aborted), so a
 * slow earlier request can never overwrite newer data. While reloading, the
 * previous data stays available to avoid layout flicker.
 */
export function useApiResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): ResourceState<T> & { reload: () => Promise<void> } {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' });
  const controllerRef = useRef<AbortController | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((previous) => ({ status: 'loading', data: previous.data }));
    try {
      const data = await loadRef.current(controller.signal);
      if (!controller.signal.aborted) setState({ status: 'success', data });
    } catch (error) {
      if (!controller.signal.aborted) {
        setState((previous) => ({ status: 'error', data: previous.data, error }));
      }
    }
  }, []);

  useEffect(() => {
    void run();
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: run };
}
