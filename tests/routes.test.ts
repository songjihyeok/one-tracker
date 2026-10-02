import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { lineString } from '@turf/helpers';
import { lineIntersect } from '@turf/line-intersect';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import { sampleRoute, vesselRegistry } from '../shared/data.js';
import { createVoyageTrack, initialVoyageDistance, nauticalDistance, sampleVoyage, seaCorridors } from '../shared/maritimeRoutes.js';
import type { SeaCoordinate, SimulatedVessel, VoyageTrack } from '../shared/simulation.js';
import { VesselStore } from '../server/store.js';
import { routeData } from '../src/components/simulation/routeGeometry.js';

const fixtureBytes = readFileSync(new URL('./fixtures/ne10m-land-grid.geojson.gz', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('./fixtures/ne10m-land-manifest.json', import.meta.url), 'utf8'));
const land = JSON.parse(gunzipSync(fixtureBytes).toString('utf8')) as FeatureCollection<MultiPolygon, { x: number; y: number }>;
const cells = new Map(land.features.map((feature) => [`${feature.properties.x},${feature.properties.y}`, feature]));
const grid = manifest.gridDegrees as number;
const voyages = vesselRegistry.map((vessel) => ({ vessel, track: createVoyageTrack(sampleRoute(vessel.imo, 0)) }));

function nearbyLand(a: SeaCoordinate, b = a): Feature<MultiPolygon>[] {
  const found: Feature<MultiPolygon>[] = [];
  // Epsilon includes both cells when a point lies exactly on a partition edge.
  for (let x = Math.floor((Math.min(a[0], b[0]) - 1e-10) / grid); x <= Math.floor((Math.max(a[0], b[0]) + 1e-10) / grid); x += 1) {
    for (let y = Math.floor((Math.min(a[1], b[1]) - 1e-10) / grid); y <= Math.floor((Math.max(a[1], b[1]) + 1e-10) / grid); y += 1) {
      const feature = cells.get(`${x},${y}`);
      if (feature) found.push(feature);
    }
  }
  return found;
}

function onLand(coordinate: SeaCoordinate): boolean {
  return nearbyLand(coordinate).some((polygon) => booleanPointInPolygon(coordinate, polygon));
}

function crossesLand(a: SeaCoordinate, b: SeaCoordinate): boolean {
  const segment = lineString([a, b]);
  const midpoint: SeaCoordinate = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return nearbyLand(a, b).some((polygon) => booleanPointInPolygon(a, polygon) || booleanPointInPolygon(b, polygon) || booleanPointInPolygon(midpoint, polygon) || lineIntersect(segment, polygon).features.length > 0);
}

test('offline land fixture preserves verified global Natural Earth provenance and detects former inland ports', () => {
  assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'), manifest.fixtureSha256);
  assert.equal(manifest.sourcePolygons, 6837);
  assert.equal(land.features.length, manifest.landCells);
  assert.ok(manifest.landCells > 1000);
  assert.equal(onLand([121.47, 31.23]), true, 'old Shanghai city-center endpoint must be detected as land');
  assert.equal(onLand([9.96, 53.53]), true, 'old Hamburg city-center endpoint must be detected as land');
  assert.equal(crossesLand([105, 0], [98, 0]), true, 'the invalid shortcut through Sumatra must fail');
  assert.equal(crossesLand([80, 20], [120, 40]), true, 'the invalid overland Asia shortcut must fail');
});

test('every complete curated corridor segment avoids all represented land, including small islands', () => {
  let checked = 0;
  for (const corridor of seaCorridors) {
    for (let index = 1; index < corridor.coordinates.length; index += 1) {
      const a = corridor.coordinates[index - 1];
      const b = corridor.coordinates[index];
      assert.equal(crossesLand(a, b), false, `${corridor.from} → ${corridor.to}, segment ${index}: ${JSON.stringify([a, b])}`);
      checked += 1;
    }
  }
  assert.ok(checked > 100);
});

test('all four assembled voyages have increasing distances, offshore stops and no land intersections', () => {
  for (const { vessel, track } of voyages) {
    const route = sampleRoute(vessel.imo, 0);
    assert.equal(track.coordinates.length, track.cumulativeNm.length);
    assert.equal(track.cumulativeNm[0], 0);
    assert.equal(track.cumulativeNm.at(-1), track.distanceNm);
    assert.equal(track.stops.length, route.length);
    for (let index = 0; index < track.stops.length; index += 1) {
      const stop = track.stops[index];
      assert.equal(stop.portCode, route[index].portCode);
      assert.ok(nauticalDistance(stop.coordinate, [route[index].longitude, route[index].latitude]) < 1e-7);
      assert.equal(onLand(stop.coordinate), false, `${stop.portName} approach is inland`);
      if (index) assert.ok(stop.distanceNm > track.stops[index - 1].distanceNm);
    }
    for (let index = 1; index < track.coordinates.length; index += 1) {
      assert.ok(track.cumulativeNm[index] > track.cumulativeNm[index - 1]);
      assert.ok(track.cumulativeNm[index] - track.cumulativeNm[index - 1] <= 12);
      assert.equal(crossesLand(track.coordinates[index - 1], track.coordinates[index]), false, `${vessel.name} dense segment ${index} crosses land`);
    }
  }
});

test('animation sampled every half nautical mile stays at sea with finite headings and monotonic progress', () => {
  let samples = 0;
  for (const { vessel, track } of voyages) {
    let previousProgress = -1;
    for (let distance = 0; distance <= track.distanceNm; distance += 0.5) {
      const position = sampleVoyage(track, distance);
      assert.equal(onLand([position.longitude, position.latitude]), false, `${vessel.name} animation at ${distance} nm touches land`);
      assert.ok(Number.isFinite(position.heading) && position.heading >= 0 && position.heading < 360);
      assert.ok(position.progress >= previousProgress && position.progress <= 1);
      assert.ok(position.legIndex >= 0 && position.legIndex < track.stops.length - 1);
      previousProgress = position.progress;
      samples += 1;
    }
  }
  assert.ok(samples > 50_000);
});

test('sampler clamps at both ends and never jumps from arrival back across land to departure', () => {
  for (const { track } of voyages) {
    const start = sampleVoyage(track, -1000);
    const end = sampleVoyage(track, track.distanceNm + 1_000_000);
    assert.deepEqual([start.longitude, start.latitude], track.coordinates[0]);
    assert.ok(nauticalDistance([end.longitude, end.latitude], track.coordinates.at(-1)!) < 1e-7);
    assert.equal(start.progress, 0);
    assert.equal(end.progress, 1);
    assert.equal(end.legIndex, track.stops.length - 2);
    assert.deepEqual(sampleVoyage(track, Infinity), end);
    assert.deepEqual(sampleVoyage(track, NaN), sampleVoyage(track, 0));
    for (let index = 0; index < track.stops.length - 1; index += 1) {
      const betweenStops = (track.stops[index].distanceNm + track.stops[index + 1].distanceNm) / 2;
      assert.equal(sampleVoyage(track, betweenStops).legIndex, index);
    }
  }
  const eastbound: VoyageTrack = { coordinates: [[0, 0], [1, 0]], cumulativeNm: [0, 60], distanceNm: 60, stops: [{ portCode: 'A', portName: 'A', coordinate: [0, 0], distanceNm: 0 }, { portCode: 'B', portName: 'B', coordinate: [1, 0], distanceNm: 60 }] };
  assert.equal(sampleVoyage(eastbound, 30).heading, 90);
  assert.equal(sampleVoyage(eastbound, 30).longitude, 0.5);
});

test('demo initialization projects to the first sea leg; AIS is never used as a simulation connector', () => {
  const store = new VesselStore();
  for (const { vessel, track } of voyages) {
    const demo = store.getVessel(vessel.imo)!;
    const distance = initialVoyageDistance(track, demo);
    assert.ok(distance >= 0 && distance <= track.stops[1].distanceNm);
    const position = sampleVoyage(track, distance);
    assert.equal(onLand([position.longitude, position.latitude]), false);
    const live = { ...demo, source: 'live' as const, position: { latitude: 40, longitude: 90, updatedAt: new Date().toISOString() } };
    assert.equal(initialVoyageDistance(track, live), track.stops[1].distanceNm * 0.2);
    assert.equal(initialVoyageDistance(track, { ...demo, position: undefined }), track.stops[1].distanceNm * 0.2);
  }
});

test('reverse passages reuse sea corridors, unknown ports fail, and long passages use Cape and Malacca', () => {
  const singapore = sampleRoute(vesselRegistry[0].imo, 0)[2];
  const rotterdam = sampleRoute(vesselRegistry[0].imo, 0)[3];
  const forward = createVoyageTrack([singapore, rotterdam]);
  const reverse = createVoyageTrack([rotterdam, singapore]);
  assert.ok(Math.abs(forward.distanceNm - reverse.distanceNm) < 1e-6);
  assert.ok(forward.coordinates.some(([longitude, latitude]) => longitude > 15 && longitude < 30 && latitude < -35), 'Europe passage must go south of Africa');
  assert.ok(forward.coordinates.some(([longitude, latitude]) => longitude > 99 && longitude < 102 && latitude > 2 && latitude < 5), 'Singapore passage must go through Malacca');
  assert.throws(() => createVoyageTrack([singapore, { ...rotterdam, portCode: 'UNKNOWN' }]), /No curated sea corridor/);
  assert.throws(() => createVoyageTrack([singapore]), /at least two/);
  assert.throws(() => createVoyageTrack([singapore, singapore]), /distinct/);
  // An inland caller-provided coordinate cannot introduce a hidden straight connector.
  const altered = createVoyageTrack([{ ...singapore, longitude: 90, latitude: 40 }, rotterdam]);
  assert.deepEqual(altered.coordinates, forward.coordinates);
});

test('rendered traveled trails retain the full sea-track prefix in every port leg without long land-cutting chords', () => {
  const store = new VesselStore();
  const checkedSegments = new Set<string>();
  let cases = 0;
  for (const { vessel, track } of voyages) {
    const distances = [0, track.distanceNm, ...track.stops.map((stop) => stop.distanceNm)];
    for (let leg = 0; leg < track.stops.length - 1; leg += 1) {
      const start = track.stops[leg].distanceNm;
      const length = track.stops[leg + 1].distanceNm - start;
      for (const fraction of [0.2, 0.5, 0.85]) distances.push(start + length * fraction);
    }
    const originalTrack = structuredClone(track);
    for (const distanceNm of distances) {
      const position = sampleVoyage(track, distanceNm);
      const simulated: SimulatedVessel = { vessel: store.getVessel(vessel.imo)!, track, position, distanceNm, speedKnots: 17 };
      const traveled = routeData(simulated, true);
      assert.equal(traveled.features.length, 1);
      const coordinates = traveled.features[0].geometry.coordinates as SeaCoordinate[];
      // Progress describes distance along the dense sea track. A port-leg index (0..2)
      // cannot be used as an index into its hundreds of coastline-avoiding coordinates.
      const reportedDistance = position.progress * track.distanceNm;
      const expectedPrefix = track.coordinates.filter((_coordinate, index) => track.cumulativeNm[index] <= reportedDistance);
      assert.deepEqual(coordinates, [...expectedPrefix, [position.longitude, position.latitude]], `${vessel.name} trail at ${distanceNm} nm skips sea-track vertices`);
      assert.equal(traveled.features[0].properties?.imo, vessel.imo);
      for (let index = 1; index < coordinates.length; index += 1) {
        const a = coordinates[index - 1];
        const b = coordinates[index];
        const length = nauticalDistance(a, b);
        assert.ok(length <= 12 + 1e-7, `${vessel.name} trail segment ${index} is a ${length} nm shortcut`);
        const key = JSON.stringify([a, b]);
        if (!checkedSegments.has(key)) {
          assert.equal(length < 1e-8 ? onLand(b) : crossesLand(a, b), false, `${vessel.name} rendered trail crosses land at ${distanceNm} nm`);
          checkedSegments.add(key);
        }
      }
      assert.deepEqual(routeData(simulated, false).features[0].geometry.coordinates, originalTrack.coordinates, 'full route geometry must not be trimmed by traveled progress');
      cases += 1;
    }
    assert.deepEqual(track, originalTrack, 'rendering traveled geometry must not mutate the shared track');
  }
  assert.ok(cases >= 50);
  assert.deepEqual(routeData(undefined, true), { type: 'FeatureCollection', features: [] });
  assert.deepEqual(routeData(undefined, false), { type: 'FeatureCollection', features: [] });
});
