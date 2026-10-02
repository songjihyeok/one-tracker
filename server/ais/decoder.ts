import type { RawData } from 'ws';
import type { VesselPosition } from '../../shared/types.js';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : undefined;
const numberInRange = (value: unknown, minimum: number, maximum: number): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum ? value : undefined;

export function parseFrame(data: RawData | string): ObjectValue | undefined {
  try {
    const decoded = typeof data === 'string' ? data : (Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)).toString('utf8');
    return object(JSON.parse(decoded));
  } catch {
    return undefined;
  }
}

export function parseAisTimestamp(value: unknown, receivedAt: number): string {
  let parsed = NaN;
  if (typeof value === 'string') {
    // AISStream can serialize Go timestamps: "2026-10-02 01:02:03.123456789 +0000 UTC".
    const goTime = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?\s+([+-]\d{4})(?:\s+[A-Za-z]+)?$/.exec(value.trim());
    const normalized = goTime ? `${goTime[1]}T${goTime[2]}${(goTime[3] ?? '').slice(0, 4)}${goTime[4].slice(0, 3)}:${goTime[4].slice(3)}` : value;
    parsed = Date.parse(normalized);
  }
  // Missing/malformed timestamps use arrival time; impossible future stamps must not make data fresh forever.
  return new Date(Number.isFinite(parsed) && parsed <= receivedAt + 300_000 ? parsed : receivedAt).toISOString();
}

export function decodePosition(frame: unknown, receivedAt = Date.now()): { mmsi: string; position: VesselPosition } | undefined {
  const envelope = object(frame);
  if (envelope?.MessageType !== 'PositionReport') return undefined;
  const metadata = object(envelope.MetaData);
  const report = object(object(envelope.Message)?.PositionReport);
  if (!report || report.Valid === false) return undefined;
  const identifier = metadata?.MMSI ?? report.UserID;
  const mmsi = String(identifier ?? '');
  if (!/^\d{9}$/.test(mmsi)) return undefined;
  if (report.UserID !== undefined && String(report.UserID) !== mmsi) return undefined;
  const latitude = numberInRange(report.Latitude ?? metadata?.latitude ?? metadata?.Latitude, -90, 90);
  const longitude = numberInRange(report.Longitude ?? metadata?.longitude ?? metadata?.Longitude, -180, 180);
  if (latitude === undefined || longitude === undefined) return undefined;
  return {
    mmsi,
    position: {
      latitude,
      longitude,
      // AIS unavailable sentinels: speed 102.3, course 360, heading 511.
      speed: numberInRange(report.Sog, 0, 102.2),
      course: numberInRange(report.Cog, 0, 359.9),
      heading: numberInRange(report.TrueHeading, 0, 359),
      updatedAt: parseAisTimestamp(metadata?.time_utc, receivedAt),
    },
  };
}
