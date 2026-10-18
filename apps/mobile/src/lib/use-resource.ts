import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Loads async data with loading / error / reload state. `key` changes trigger a reload;
 * responses from earlier keys are ignored. State is only updated when results arrive.
 */
export function useResource<T>(load: () => Promise<T>, key: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const loader = useRef(load);
  useLayoutEffect(() => {
    loader.current = load;
  });

  const run = useCallback((current: number) => {
    return loader
      .current()
      .then((result) => {
        if (current !== generation.current) return;
        setData(result);
        setError(null);
      })
      .catch((failure: unknown) => {
        if (current !== generation.current) return;
        setError(failure instanceof Error ? failure.message : "Something went wrong.");
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
  }, []);

  /** Manual reload (pull to refresh, retry buttons). */
  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    await run(current);
  }, [run]);

  useEffect(() => {
    void run(++generation.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller controls reloads via `key`
  }, key);

  return { data, error, loading, reload, setData };
}
