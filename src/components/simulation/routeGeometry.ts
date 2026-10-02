import type { FeatureCollection, LineString } from 'geojson';
import type { SimulatedVessel } from '../../../shared/simulation';

const emptyLines: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };

export function routeData(vessel: SimulatedVessel | undefined, traveled = false): FeatureCollection<LineString> {
  if (!vessel) return emptyLines;
  let coordinates = vessel.track.coordinates;
  if (traveled) {
    const distance = vessel.position.progress * vessel.track.distanceNm;
    let low = 0;
    let high = vessel.track.cumulativeNm.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (vessel.track.cumulativeNm[middle] <= distance) low = middle; else high = middle - 1;
    }
    coordinates = [...coordinates.slice(0, low + 1), [vessel.position.longitude, vessel.position.latitude]];
    if (coordinates.length < 2) coordinates = [coordinates[0], coordinates[0]];
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { imo: vessel.vessel.imo }, geometry: { type: 'LineString', coordinates } }] };
}

