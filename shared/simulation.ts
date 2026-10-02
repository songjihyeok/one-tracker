import type { Vessel } from './types';

/** GeoJSON order: longitude, latitude. */
export type SeaCoordinate = [number, number];

export type VoyageTrack = {
  coordinates: SeaCoordinate[];
  cumulativeNm: number[];
  distanceNm: number;
  stops: { portCode: string; portName: string; distanceNm: number; coordinate: SeaCoordinate }[];
};

export type SimulatedPosition = {
  longitude: number;
  latitude: number;
  heading: number;
  legIndex: number;
  progress: number;
};

export type SimulatedVessel = {
  vessel: Vessel;
  track: VoyageTrack;
  position: SimulatedPosition;
  distanceNm: number;
  speedKnots: number;
};

export type CameraMode = 'follow' | 'overview' | 'free';

export type VoyageSceneProps = {
  fleet: SimulatedVessel[];
  selectedImo: string;
  cameraMode: CameraMode;
  onCameraModeChange: (mode: CameraMode) => void;
  onSelectVessel: (imo: string) => void;
  showRoutes: boolean;
  playing: boolean;
  /** Stable simulation elapsed seconds, shared by every vessel. */
  elapsedSeconds: number;
};
