import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loads async data with loading / error / reload state. `key` changes trigger a reload;
 * stale responses from earlier keys are ignored.
 */
export function useResource<T>(load: () => Promise<T>, key: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loader.current();
      if (current === generation.current) setData(result);
    } catch (failure) {
      if (current === generation.current) {
        setError(failure instanceof Error ? failure.message : "Something went wrong.");
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller controls reloads via `key`
  }, key);

  return { data, error, loading, reload, setData };
}
