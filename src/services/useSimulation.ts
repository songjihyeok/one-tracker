import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FleetResponse, Vessel } from "../../shared/types";
import type { SimulatedVessel } from "../../shared/simulation";
import {
  createVoyageTrack,
  initialVoyageDistance,
  sampleVoyage,
} from "../../shared/maritimeRoutes";

export function useSimulation(active: boolean) {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedImo, setSelectedImo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [requestKey, setRequestKey] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(60);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const clock = useRef({ elapsed: 0, previous: 0, published: 0 });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error(
            "The fleet service took too long to respond. Please try again.",
          ),
        ),
      15_000,
    );
    let cancelled = false;
    async function fetchJson<T>(url: string) {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new Error(
          `Unable to load the fleet (HTTP ${response.status}). Please try again.`,
        );
      return response.json() as Promise<T>;
    }
    async function load() {
      setLoading(true);
      setError(undefined);
      try {
        const registry = await fetchJson<FleetResponse>("/api/vessels");
        if (!registry.vessels.length)
          throw new Error("No vessels are available for the simulation yet.");
        const result = await Promise.all(
          registry.vessels.map((vessel) =>
            fetchJson<Vessel>(`/api/vessels/${encodeURIComponent(vessel.imo)}`),
          ),
        );
        if (cancelled) return;
        setVessels(result);
        setSelectedImo((current) =>
          result.some((vessel) => vessel.imo === current)
            ? current
            : result[0].imo,
        );
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load the fleet. Please try again.",
          );
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [requestKey]);

  // Raw AIS records are never modified. Simulation positions live in separate objects.
  const prepared = useMemo(
    () =>
      vessels.map((vessel) => {
        const track = createVoyageTrack(vessel.route);
        return {
          vessel,
          track,
          initialDistance: initialVoyageDistance(track, vessel),
          speedKnots:
            vessel.position?.speed && vessel.position.speed > 0
              ? vessel.position.speed
              : 17,
        };
      }),
    [vessels],
  );

  const durationSeconds = useMemo(
    () =>
      Math.ceil(
        Math.max(
          1,
          ...prepared.map(
            (item) =>
              ((item.track.distanceNm - item.initialDistance) /
                item.speedKnots) *
              3600,
          ),
        ),
      ),
    [prepared],
  );

  useEffect(() => {
    clock.current.previous = 0;
    if (!active || !playing || !prepared.length) return;
    let frame = 0;
    const onVisibilityChange = () => {
      clock.current.previous = 0;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    function tick(timestamp: number) {
      const state = clock.current;
      if (!document.hidden) {
        const delta = state.previous
          ? Math.min((timestamp - state.previous) / 1000, 0.25)
          : 0;
        state.elapsed = Math.min(
          durationSeconds,
          state.elapsed + delta * speed,
        );
        state.previous = timestamp;
        if (
          timestamp - state.published >= 100 ||
          state.elapsed >= durationSeconds
        ) {
          setElapsedSeconds(state.elapsed);
          state.published = timestamp;
        }
        if (state.elapsed >= durationSeconds) {
          setPlaying(false);
          return;
        }
      } else state.previous = 0;
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clock.current.previous = 0;
    };
  }, [active, playing, speed, prepared.length, durationSeconds]);

  const fleet: SimulatedVessel[] = useMemo(
    () =>
      prepared.map((item) => {
        const distanceNm = Math.min(
          item.track.distanceNm,
          item.initialDistance + (item.speedKnots * elapsedSeconds) / 3600,
        );
        return {
          vessel: item.vessel,
          track: item.track,
          distanceNm,
          speedKnots: distanceNm >= item.track.distanceNm ? 0 : item.speedKnots,
          position: sampleVoyage(item.track, distanceNm),
        };
      }),
    [prepared, elapsedSeconds],
  );

  const seek = useCallback(
    (seconds: number) => {
      const value = Math.max(0, Math.min(durationSeconds, seconds));
      clock.current.elapsed = value;
      clock.current.previous = 0;
      setElapsedSeconds(value);
    },
    [durationSeconds],
  );
  const restart = useCallback(() => {
    seek(0);
  }, [seek]);
  const togglePlaying = useCallback(() => {
    setElapsedSeconds(clock.current.elapsed);
    clock.current.previous = 0;
    setPlaying((value) => !value);
  }, []);
  const changeSpeed = useCallback((value: number) => {
    setElapsedSeconds(clock.current.elapsed);
    clock.current.previous = 0;
    setSpeed(value);
  }, []);
  const retry = useCallback(() => setRequestKey((value) => value + 1), []);

  return {
    fleet,
    selected: fleet.find((item) => item.vessel.imo === selectedImo),
    selectedImo,
    selectVessel: setSelectedImo,
    loading,
    error,
    retry,
    playing,
    togglePlaying,
    speed,
    changeSpeed,
    elapsedSeconds,
    durationSeconds,
    seek,
    restart,
  };
}

export type SimulationModel = ReturnType<typeof useSimulation>;
