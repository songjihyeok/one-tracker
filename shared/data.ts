import type { RoutePoint, VesselPosition, VesselSummary } from './types.js';

// Identifiers checked against Port of Hamburg and current AIS registries in October 2026.
// These are vessel identities only: the service labels, positions and schedules below are illustrative.
// https://www.hafen-hamburg.de/de/schiffe/one-innovation/
// https://www.hafen-hamburg.de/de/schiffe/one-hamburg-3810/
// https://www.myshiptracking.com/vessels/one-houston-mmsi-431042000-imo-9566382
// https://www.classnk.or.jp/register/regships/one_dsp.aspx?imo=9806079
// https://www.hafen-hamburg.de/en/vessels/houston-bridge-27776/
// https://www.hafen-hamburg.de/en/vessels/one-apus-48776/
export const vesselRegistry: readonly VesselSummary[] = [
  { name: 'ONE INNOVATION', imo: '9939137', mmsi: '636022889', carrier: 'ONE', flag: 'Liberia', capacity: 24136, service: 'Asia – Europe' },
  { name: 'ONE HAMBURG', imo: '9395159', mmsi: '372724000', carrier: 'ONE', flag: 'Panama', capacity: 8212, service: 'Asia – Europe' },
  { name: 'ONE HOUSTON', imo: '9566382', mmsi: '431042000', carrier: 'ONE', flag: 'Japan', capacity: 8930, service: 'Intra-Asia' },
  { name: 'ONE APUS', imo: '9806079', mmsi: '431003000', carrier: 'ONE', flag: 'Japan', capacity: 14052, service: 'Asia – Europe' },
];

type Port = Omit<RoutePoint, 'status' | 'eta' | 'etd'>;
// Simulation endpoints are offshore port approaches, not city centers or berths.
// Shanghai uses the Yangshan approach; Hamburg uses the outer Elbe approach.
// Keeping every stop at sea avoids pretending to navigate inland waterways.
const ports = {
  busan: { portCode: 'KRPUS', portName: 'Busan', country: 'South Korea', countryCode: 'KR', latitude: 34.92, longitude: 129.16 },
  shanghai: { portCode: 'CNSHA', portName: 'Shanghai', country: 'China', countryCode: 'CN', latitude: 30.48, longitude: 122.58 },
  singapore: { portCode: 'SGSIN', portName: 'Singapore', country: 'Singapore', countryCode: 'SG', latitude: 1.17, longitude: 103.9 },
  rotterdam: { portCode: 'NLRTM', portName: 'Rotterdam', country: 'Netherlands', countryCode: 'NL', latitude: 52.02, longitude: 3.6 },
  hamburg: { portCode: 'DEHAM', portName: 'Hamburg', country: 'Germany', countryCode: 'DE', latitude: 54.0, longitude: 7.9 },
  tokyo: { portCode: 'JPTYO', portName: 'Tokyo', country: 'Japan', countryCode: 'JP', latitude: 35.2, longitude: 139.8 },
  kaohsiung: { portCode: 'TWKHH', portName: 'Kaohsiung', country: 'Taiwan', countryCode: 'TW', latitude: 22.5, longitude: 120.12 },
  hongKong: { portCode: 'HKHKG', portName: 'Hong Kong', country: 'Hong Kong', countryCode: 'HK', latitude: 21.95, longitude: 114.3 },
  colombo: { portCode: 'LKCMB', portName: 'Colombo', country: 'Sri Lanka', countryCode: 'LK', latitude: 6.95, longitude: 79.7 },
} satisfies Record<string, Port>;

// All offsets are relative to one server-start snapshot, never to each HTTP request.
const sampleJourneys: Record<string, { ports: Port[]; hours: number[]; position: Omit<VesselPosition, 'updatedAt'>; ageMinutes: number }> = {
  '9939137': { ports: [ports.busan, ports.shanghai, ports.singapore, ports.rotterdam], hours: [-22, 18, 154, 754], position: { latitude: 31.85, longitude: 126.15, speed: 17.2, course: 248, heading: 249 }, ageMinutes: 2 },
  '9395159': { ports: [ports.rotterdam, ports.hamburg, ports.singapore, ports.hongKong], hours: [-12, 18, 714, 834], position: { latitude: 53.72, longitude: 5.11, speed: 14.6, course: 64, heading: 65 }, ageMinutes: 7 },
  '9566382': { ports: [ports.tokyo, ports.busan, ports.kaohsiung, ports.singapore], hours: [-20, 24, 90, 210], position: { latitude: 33.18, longitude: 134.5, speed: 16.8, course: 260, heading: 261 }, ageMinutes: 14 },
  '9806079': { ports: [ports.singapore, ports.colombo, ports.rotterdam, ports.hamburg], hours: [-54, 54, 606, 642], position: { latitude: 5.78, longitude: 91.18, speed: 18.4, course: 276, heading: 276 }, ageMinutes: 730 },
};

export function sampleRoute(imo: string, startedAt: number): RoutePoint[] {
  const journey = sampleJourneys[imo];
  if (!journey) return [];
  return journey.ports.map((port, index) => {
    const time = new Date(startedAt + journey.hours[index] * 3_600_000).toISOString();
    return { ...port, status: index === 0 ? 'departed' : index === 1 ? 'next' : 'scheduled', ...(index === 0 ? { etd: time } : { eta: time }) };
  });
}

export function samplePosition(imo: string, startedAt: number): VesselPosition | undefined {
  const journey = sampleJourneys[imo];
  return journey && { ...journey.position, updatedAt: new Date(startedAt - journey.ageMinutes * 60_000).toISOString() };
}
