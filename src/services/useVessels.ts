import { useCallback, useEffect, useRef, useState } from 'react';
import type { FleetResponse, Vessel } from '../../shared/types';

const POLL_INTERVAL = 15_000;

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(new Error('The tracking service took too long to respond. Please try again.')), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`The tracking service returned ${response.status}. Please try again.`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}

export function useVessels() {
  const [fleet, setFleet] = useState<FleetResponse>();
  const [selectedImo, setSelectedImo] = useState('');
  const [vessel, setVessel] = useState<Vessel>();
  const [error, setError] = useState<string>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastChecked, setLastChecked] = useState<Date>();
  const cache = useRef(new Map<string, Vessel>());

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  const selectVessel = useCallback((imo: string) => {
    setVessel(cache.current.get(imo));
    setSelectedImo(imo);
    setError(undefined);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      setIsRefreshing(true);
      try {
        if (!selectedImo) {
          const data = await getJson<FleetResponse>('/api/vessels', controller.signal);
          if (controller.signal.aborted) return;
          setFleet(data);
          if (!data.vessels.length) throw new Error('No vessels have been registered yet. Please try again later.');
          setSelectedImo(data.vessels[0].imo);
          return;
        }
        const data = await getJson<Vessel>(`/api/vessels/${encodeURIComponent(selectedImo)}`, controller.signal);
        if (controller.signal.aborted) return;
        cache.current.set(data.imo, data);
        setVessel(data);
        setError(undefined);
        setLastChecked(new Date());
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Unable to connect to the tracking service.');
      } finally {
        if (!controller.signal.aborted) {
          setIsRefreshing(false);
          timer = setTimeout(() => void load(), POLL_INTERVAL);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectedImo, refreshKey]);

  return { fleet, selectedImo, vessel, error, isRefreshing, lastChecked, refresh, selectVessel };
}
