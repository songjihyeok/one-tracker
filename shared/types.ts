export type RouteStatus = 'departed' | 'next' | 'scheduled';

export type RoutePoint = {
  portCode: string;
  portName: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  status: RouteStatus;
  eta?: string;
  etd?: string;
};

export type VesselPosition = {
  latitude: number;
  longitude: number;
  speed?: number;
  course?: number;
  heading?: number;
  updatedAt: string;
};

export type VesselSummary = {
  name: string;
  imo: string;
  mmsi: string;
  carrier: 'ONE';
  flag: string;
  capacity: number;
  service: string;
};

export type StreamStatus = 'demo' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export type Vessel = VesselSummary & {
  position?: VesselPosition;
  route: RoutePoint[];
  source: 'demo' | 'live' | 'waiting';
  scheduleSource: 'sample';
  streamStatus: StreamStatus;
};

export type FleetResponse = {
  vessels: VesselSummary[];
  mode: 'demo' | 'live';
  streamStatus: StreamStatus;
};
