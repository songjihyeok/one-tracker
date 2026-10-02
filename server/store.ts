import { samplePosition, sampleRoute, vesselRegistry } from '../shared/data.js';
import type { FleetResponse, StreamStatus, Vessel, VesselPosition } from '../shared/types.js';

export class VesselStore {
  readonly mode: 'demo' | 'live';
  private streamStatus: StreamStatus;
  private readonly vessels: Map<string, Vessel>;

  constructor({ live = false, startedAt = Date.now() }: { live?: boolean; startedAt?: number } = {}) {
    this.mode = live ? 'live' : 'demo';
    this.streamStatus = live ? 'connecting' : 'demo';
    this.vessels = new Map(vesselRegistry.map((summary) => [summary.imo, {
      ...summary,
      position: live ? undefined : samplePosition(summary.imo, startedAt),
      route: sampleRoute(summary.imo, startedAt),
      source: live ? 'waiting' : 'demo',
      scheduleSource: 'sample',
      streamStatus: this.streamStatus,
    }]));
  }

  getFleet(): FleetResponse {
    return { vessels: vesselRegistry.map((vessel) => ({ ...vessel })), mode: this.mode, streamStatus: this.streamStatus };
  }

  getVessel(imo: string): Vessel | undefined {
    const vessel = this.vessels.get(imo);
    return vessel && structuredClone({ ...vessel, streamStatus: this.streamStatus });
  }

  setStreamStatus(status: StreamStatus): void {
    if (this.mode === 'live') this.streamStatus = status;
  }

  updatePosition(mmsi: string, position: VesselPosition): boolean {
    if (this.mode !== 'live') return false;
    const vessel = [...this.vessels.values()].find((entry) => entry.mmsi === mmsi);
    if (!vessel || !Number.isFinite(Date.parse(position.updatedAt))) return false;
    if (vessel.position && Date.parse(position.updatedAt) <= Date.parse(vessel.position.updatedAt)) return false;
    vessel.position = { ...position };
    vessel.source = 'live';
    return true;
  }
}
