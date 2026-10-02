import type { SeaCoordinate, SimulatedPosition, VoyageTrack } from './simulation';
import type { RoutePoint, Vessel } from './types';

/** Curated simulation corridors checked against Natural Earth 1:10m land.
 * These are offshore approaches and illustrative sea passages, NOT navigational routes.
 * Rendering and movement must linearly interpolate these points; splines can cut across land.
 */
export const seaCorridors: readonly { from: string; to: string; coordinates: SeaCoordinate[] }[] = [
  { from: 'KRPUS', to: 'CNSHA', coordinates: [
    [129.16, 34.92], [129.05, 34.65], [128.6, 34.0], [128.3, 33.35], [127.9, 32.65],
    [125.8, 31.6], [124.2, 31.0], [123.0, 30.6], [122.58, 30.48],
  ] },
  { from: 'CNSHA', to: 'TWKHH', coordinates: [
    [122.58, 30.48], [123.05, 30.1], [123.2, 29.3], [122.5, 27.1], [121.1, 25.8],
    [119.8, 24.9], [119.1, 23.8], [118.9, 22.5], [119.5, 21.7], [120.12, 22.5],
  ] },
  { from: 'TWKHH', to: 'HKHKG', coordinates: [
    [120.12, 22.5], [119.0, 21.7], [116.8, 21.2], [114.3, 21.95],
  ] },
  { from: 'HKHKG', to: 'SGSIN', coordinates: [
    [114.3, 21.95], [113.7, 21.4], [112.8, 19.8], [111.5, 17.5], [110.4, 14.2],
    [108.7, 10.2], [106.2, 6.8], [104.8, 3.1], [104.65, 1.7], [104.45, 1.35],
    [104.18, 1.27], [104.0, 1.23], [103.9, 1.17],
  ] },
  { from: 'SGSIN', to: 'LKCMB', coordinates: [
    // West through Singapore Strait and Malacca Strait, north of Sumatra.
    [103.9, 1.17], [103.75, 1.15], [103.55, 1.08], [103.4, 1.18], [103.2, 1.4],
    [102.9, 1.6], [102.3, 1.95], [101.5, 2.5], [100.8, 3.15], [99.8, 4.0], [98.8, 5.2],
    [98.0, 5.8], [96.8, 6.3], [95.0, 6.1], [91.0, 5.3], [85.0, 5.1],
    [81.0, 5.1], [79.85, 5.9], [79.7, 6.95],
  ] },
  { from: 'LKCMB', to: 'NLRTM', coordinates: [
    // Cape of Good Hope, west of Africa, then the English Channel and North Sea.
    [79.7, 6.95], [78.5, 6.0], [76.0, 3.0], [74.0, -2.0], [73.0, -8.0], [69.0, -12.0],
    [62.0, -20.0], [54.0, -31.0], [45.0, -36.0], [33.0, -38.0], [23.0, -38.0],
    [17.0, -36.0], [11.0, -28.0], [3.0, -12.0], [-5.0, 0.0], [-14.0, 8.0],
    [-18.0, 9.0], [-20.0, 17.0], [-20.0, 27.0], [-22.0, 30.0], [-16.0, 38.0], [-11.0, 43.0],
    [-8.0, 47.5], [-5.5, 49.0], [-3.0, 49.7], [-1.0, 50.2], [0.7, 50.65],
    [1.5, 51.0], [2.0, 51.45], [2.7, 51.8], [3.6, 52.02],
  ] },
  { from: 'NLRTM', to: 'DEHAM', coordinates: [
    [3.6, 52.02], [3.55, 52.5], [4.15, 53.15], [4.8, 53.75], [6.0, 54.1],
    [7.2, 54.1], [7.9, 54.0],
  ] },
  { from: 'JPTYO', to: 'KRPUS', coordinates: [
    // Tokyo Bay entrance, south of the Japanese islands, west of Kyushu to Busan.
    [139.8, 35.2], [139.78, 35.03], [139.65, 34.8], [140.15, 34.5], [140.15, 33.4],
    [138.0, 33.0], [136.4, 32.5], [134.9, 32.1], [132.8, 31.0], [131.2, 29.9],
    [129.8, 29.9], [128.3, 30.85], [128.2, 32.0], [128.3, 33.1], [128.6, 34.0],
    [129.05, 34.65], [129.16, 34.92],
  ] },
];

const radians = (degrees: number) => degrees * Math.PI / 180;
const degrees = (radiansValue: number) => radiansValue * 180 / Math.PI;
const EARTH_RADIUS_NM = 3440.065;
const MAX_SEGMENT_NM = 12;

export function nauticalDistance(a: SeaCoordinate, b: SeaCoordinate): number {
  const latitudeDelta = radians(b[1] - a[1]);
  const longitudeDelta = radians(b[0] - a[0]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_NM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

function bearing(a: SeaCoordinate, b: SeaCoordinate): number {
  const deltaLongitude = radians(b[0] - a[0]);
  const startLatitude = radians(a[1]);
  const endLatitude = radians(b[1]);
  return (degrees(Math.atan2(Math.sin(deltaLongitude) * Math.cos(endLatitude), Math.cos(startLatitude) * Math.sin(endLatitude) - Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(deltaLongitude))) + 360) % 360;
}

type GraphEdge = { to: string; coordinates: SeaCoordinate[]; distance: number };
const graph = new Map<string, GraphEdge[]>();
for (const corridor of seaCorridors) {
  const distance = corridor.coordinates.slice(1).reduce((sum, coordinate, index) => sum + nauticalDistance(corridor.coordinates[index], coordinate), 0);
  for (const [from, to, coordinates] of [[corridor.from, corridor.to, corridor.coordinates], [corridor.to, corridor.from, [...corridor.coordinates].reverse()]] as const) {
    graph.set(from, [...(graph.get(from) ?? []), { to, coordinates, distance }]);
  }
}

function portPassage(from: string, to: string): SeaCoordinate[] {
  if (!graph.has(from) || !graph.has(to)) throw new Error(`No curated sea corridor for ${from} → ${to}.`);
  if (from === to) return [[...graph.get(from)![0].coordinates[0]]];
  const distances = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, { from: string; edge: GraphEdge }>();
  const unsettled = new Set(graph.keys());
  while (unsettled.size) {
    let current: string | undefined;
    let minimum = Infinity;
    for (const candidate of unsettled) {
      const value = distances.get(candidate) ?? Infinity;
      if (value < minimum) { current = candidate; minimum = value; }
    }
    if (!current || current === to) break;
    unsettled.delete(current);
    for (const edge of graph.get(current) ?? []) {
      const alternative = minimum + edge.distance;
      if (alternative < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, alternative);
        previous.set(edge.to, { from: current, edge });
      }
    }
  }
  if (!previous.has(to)) throw new Error(`No curated sea corridor for ${from} → ${to}.`);
  const passages: SeaCoordinate[][] = [];
  for (let cursor = to; cursor !== from;) {
    const step = previous.get(cursor)!;
    passages.unshift(step.edge.coordinates);
    cursor = step.from;
  }
  return passages.flatMap((coordinates, index) => coordinates.slice(index === 0 ? 0 : 1).map((coordinate): SeaCoordinate => [...coordinate]));
}

function densify(coordinates: SeaCoordinate[]): SeaCoordinate[] {
  const result: SeaCoordinate[] = [[...coordinates[0]]];
  for (let index = 1; index < coordinates.length; index += 1) {
    const a = coordinates[index - 1];
    const b = coordinates[index];
    // A conservative local-distance bound keeps even long north/south passages below
    // the limit after linear subdivision (great-circle averages alone can undershoot).
    const nearestEquator = a[1] * b[1] <= 0 ? 0 : Math.min(Math.abs(a[1]), Math.abs(b[1]));
    const upperDistance = EARTH_RADIUS_NM * Math.hypot(radians(b[0] - a[0]) * Math.cos(radians(nearestEquator)), radians(b[1] - a[1]));
    const steps = Math.ceil(upperDistance / MAX_SEGMENT_NM);
    for (let step = 1; step <= steps; step += 1) {
      const fraction = step / steps;
      result.push([a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]);
    }
  }
  return result;
}

export function createVoyageTrack(route: RoutePoint[]): VoyageTrack {
  if (route.length < 2) throw new Error('A simulated voyage needs at least two registered port approaches.');
  const coordinates: SeaCoordinate[] = [];
  const cumulativeNm: number[] = [];
  const stops: VoyageTrack['stops'] = [];
  let distanceNm = 0;
  for (let index = 0; index < route.length - 1; index += 1) {
    const passage = densify(portPassage(route[index].portCode, route[index + 1].portCode));
    if (index === 0) {
      coordinates.push(passage[0]);
      cumulativeNm.push(0);
      stops.push({ portCode: route[0].portCode, portName: route[0].portName, distanceNm: 0, coordinate: [...passage[0]] });
    }
    for (const coordinate of passage.slice(1)) {
      const length = nauticalDistance(coordinates[coordinates.length - 1], coordinate);
      if (length <= 1e-9) continue;
      distanceNm += length;
      coordinates.push(coordinate);
      cumulativeNm.push(distanceNm);
    }
    stops.push({ portCode: route[index + 1].portCode, portName: route[index + 1].portName, distanceNm, coordinate: [...coordinates[coordinates.length - 1]] });
  }
  if (distanceNm <= 0) throw new Error('A simulated voyage must travel between distinct port approaches.');
  return { coordinates, cumulativeNm, distanceNm, stops };
}

export function sampleVoyage(track: VoyageTrack, distanceNm: number): SimulatedPosition {
  const distance = Number.isNaN(distanceNm) ? 0 : Math.min(track.distanceNm, Math.max(0, distanceNm));
  let low = 0;
  let high = track.cumulativeNm.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (track.cumulativeNm[middle] <= distance) low = middle;
    else high = middle - 1;
  }
  const index = Math.min(low, track.coordinates.length - 2);
  const a = track.coordinates[index];
  const b = track.coordinates[index + 1];
  const fraction = (distance - track.cumulativeNm[index]) / (track.cumulativeNm[index + 1] - track.cumulativeNm[index]);
  // Linear interpolation stays on the exact coastline-tested segment. Never smooth this curve.
  const longitude = a[0] + (b[0] - a[0]) * fraction;
  const latitude = a[1] + (b[1] - a[1]) * fraction;
  const legIndex = Math.min(track.stops.length - 2, Math.max(0, track.stops.findIndex((stop) => stop.distanceNm > distance) - 1));
  return { longitude, latitude, heading: bearing(a, b), legIndex: distance >= track.distanceNm ? track.stops.length - 2 : legIndex, progress: distance / track.distanceNm };
}

export function initialVoyageDistance(track: VoyageTrack, vessel: Vessel): number {
  const firstLegEnd = track.stops[1].distanceNm;
  if (vessel.source !== 'demo' || !vessel.position) return firstLegEnd * 0.2;
  const point: SeaCoordinate = [vessel.position.longitude, vessel.position.latitude];
  let closest = Infinity;
  let chosen = firstLegEnd * 0.2;
  for (let index = 0; index < track.coordinates.length - 1 && track.cumulativeNm[index] < firstLegEnd; index += 1) {
    const a = track.coordinates[index];
    const b = track.coordinates[index + 1];
    const longitudeScale = Math.cos(radians((a[1] + b[1]) / 2));
    const dx = (b[0] - a[0]) * longitudeScale;
    const dy = b[1] - a[1];
    const denominator = dx * dx + dy * dy;
    const fraction = denominator ? Math.max(0, Math.min(1, (((point[0] - a[0]) * longitudeScale) * dx + (point[1] - a[1]) * dy) / denominator)) : 0;
    const projected: SeaCoordinate = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
    const gap = nauticalDistance(point, projected);
    if (gap < closest) {
      closest = gap;
      chosen = track.cumulativeNm[index] + (track.cumulativeNm[index + 1] - track.cumulativeNm[index]) * fraction;
    }
  }
  return Math.max(0, Math.min(firstLegEnd, chosen));
}
