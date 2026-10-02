import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer } from 'ws';
import { vesselRegistry } from '../shared/data.js';
import { createApp } from '../server/app.js';
import { startAisStream } from '../server/ais/aisStream.js';
import { decodePosition, parseAisTimestamp, parseFrame } from '../server/ais/decoder.js';
import { VesselStore } from '../server/store.js';

const now = Date.parse('2026-10-02T06:00:00Z');
const innovation = vesselRegistry[0];
function report(overrides: Record<string, unknown> = {}) {
  return {
    MessageType: 'PositionReport',
    MetaData: { MMSI: Number(innovation.mmsi), time_utc: '2026-10-02 05:58:00.123456789 +0000 UTC' },
    Message: { PositionReport: { UserID: Number(innovation.mmsi), Valid: true, Latitude: 31.85, Longitude: 126.15, Sog: 17.2, Cog: 248, TrueHeading: 249, ...overrides } },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for stream state.');
    await delay(10);
  }
}

test('demo data is explicitly labeled and the same position age survives repeated reads', () => {
  const store = new VesselStore({ startedAt: now });
  assert.equal(store.getFleet().mode, 'demo');
  assert.equal(store.getFleet().vessels.length, 4);
  const first = store.getVessel(innovation.imo)!;
  assert.equal(first.source, 'demo');
  assert.equal(first.scheduleSource, 'sample');
  assert.equal(first.position?.updatedAt, '2026-10-02T05:58:00.000Z');
  assert.equal(first.route.find((port) => port.status === 'next')?.portName, 'Shanghai');
  assert.ok(Date.parse(first.route[1].eta!) > now);
  first.position!.latitude = 0;
  first.route[0].portName = 'Changed';
  assert.equal(store.getVessel(innovation.imo)?.position?.latitude, 31.85);
  assert.equal(store.getVessel(innovation.imo)?.route[0].portName, 'Busan');
  assert.equal(store.getVessel(innovation.imo)?.position?.updatedAt, '2026-10-02T05:58:00.000Z');
  assert.equal(store.updatePosition(innovation.mmsi, decodePosition(report(), now)!.position), false);
});

test('live mode starts waiting, accepts only registered ships and rejects out-of-order data', () => {
  const store = new VesselStore({ live: true, startedAt: now });
  assert.equal(store.getFleet().mode, 'live');
  assert.equal(store.getVessel(innovation.imo)?.source, 'waiting');
  assert.equal(store.getVessel(innovation.imo)?.position, undefined);
  const { position } = decodePosition(report(), now)!;
  assert.equal(store.updatePosition('999999999', position), false);
  assert.equal(store.updatePosition(innovation.mmsi, position), true);
  assert.equal(store.getVessel(innovation.imo)?.source, 'live');
  assert.equal(store.updatePosition(innovation.mmsi, { ...position, latitude: 1, updatedAt: '2026-10-01T00:00:00Z' }), false);
  assert.equal(store.updatePosition(innovation.mmsi, { ...position, latitude: 1 }), false);
  assert.equal(store.updatePosition(innovation.mmsi, { ...position, updatedAt: 'invalid' }), false);
  store.setStreamStatus('reconnecting');
  assert.equal(store.getVessel(innovation.imo)?.streamStatus, 'reconnecting');
  assert.equal(store.getVessel(innovation.imo)?.position?.latitude, 31.85);
  assert.equal(store.getVessel(vesselRegistry[1].imo)?.source, 'waiting');
});

test('AIS decoding supports binary UTF-8 frames and Go nanosecond timestamps', () => {
  const binary = Buffer.from(JSON.stringify(report()));
  const decoded = decodePosition(parseFrame(binary), now)!;
  assert.equal(decoded.mmsi, innovation.mmsi);
  assert.equal(decoded.position.updatedAt, '2026-10-02T05:58:00.123Z');
  assert.equal(decoded.position.speed, 17.2);
  assert.equal(decoded.position.heading, 249);
  assert.deepEqual(parseFrame([binary.subarray(0, 20), binary.subarray(20)]), report());
  assert.equal(parseFrame(Buffer.from('not JSON')), undefined);
  assert.equal(parseFrame('null'), undefined);
  assert.equal(decodePosition({ MessageType: 'ShipStaticData' }), undefined);
  assert.equal(parseAisTimestamp('2026-10-02T05:00:00+00:00', now), '2026-10-02T05:00:00.000Z');
  assert.equal(parseAisTimestamp('invalid', now), '2026-10-02T06:00:00.000Z');
  assert.equal(parseAisTimestamp(undefined, now), '2026-10-02T06:00:00.000Z');
  assert.equal(parseAisTimestamp('2099-01-01T00:00:00Z', now), '2026-10-02T06:00:00.000Z');
});

test('invalid AIS positions are ignored and unavailable movement values are omitted', () => {
  for (const invalid of [{ Latitude: 91 }, { Longitude: 181 }, { Latitude: -91 }, { Latitude: NaN }, { Longitude: '126' }, { Valid: false }, { UserID: 123456789 }]) {
    assert.equal(decodePosition(report(invalid), now), undefined);
  }
  const sentinel = decodePosition(report({ Sog: 102.3, Cog: 360, TrueHeading: 511 }), now)!;
  assert.equal(sentinel.position.speed, undefined);
  assert.equal(sentinel.position.course, undefined);
  assert.equal(sentinel.position.heading, undefined);
  const stationary = decodePosition(report({ Sog: 0, Cog: 0, TrueHeading: 0, Latitude: 0, Longitude: 0 }), now)!;
  assert.equal(stationary.position.speed, 0);
  assert.equal(stationary.position.latitude, 0);
  const metadataOnly = report();
  Object.assign(metadataOnly.MetaData, { latitude: 35, longitude: 129 });
  delete (metadataOnly.Message.PositionReport as Record<string, unknown>).Latitude;
  delete (metadataOnly.Message.PositionReport as Record<string, unknown>).Longitude;
  assert.equal(decodePosition(metadataOnly, now)?.position.latitude, 35);
});

test('HTTP API returns public vessel data and useful 400/404 responses without secret fields', async (context) => {
  const store = new VesselStore({ live: true, startedAt: now });
  const server = createApp(store).listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const fleetResponse = await fetch(`${url}/api/vessels`);
  assert.equal(fleetResponse.status, 200);
  assert.equal(fleetResponse.headers.get('cache-control'), 'no-store');
  const fleet = await fleetResponse.json();
  assert.equal(fleet.vessels.length, 4);
  assert.equal(fleet.mode, 'live');
  const vessel = await (await fetch(`${url}/api/vessels/${innovation.imo}`)).json();
  assert.equal(vessel.source, 'waiting');
  assert.equal('position' in vessel, false);
  assert.equal('apiKey' in vessel, false);
  assert.equal(vessel.mmsi, '636022889');
  assert.equal((await fetch(`${url}/api/vessels/not-an-imo`)).status, 400);
  assert.equal((await fetch(`${url}/api/vessels/1111111`)).status, 404);
  assert.equal((await fetch(`${url}/api/missing`)).status, 404);
  assert.deepEqual(await (await fetch(`${url}/api/health`)).json(), { status: 'ok', mode: 'live', streamStatus: 'connecting' });
});

test('production app serves the built client while preserving API 404 responses', async (context) => {
  const clientDir = await mkdtemp(join(tmpdir(), 'one-tracker-test-'));
  await writeFile(join(clientDir, 'index.html'), '<!doctype html><title>ONE tracker test</title>');
  const server = createApp(new VesselStore(), { clientDir }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(clientDir, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  assert.match(await (await fetch(url)).text(), /ONE tracker test/);
  assert.match(await (await fetch(`${url}/vessels/saved`)).text(), /ONE tracker test/);
  const missing = await fetch(`${url}/api/missing`);
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type')!, /application\/json/);
});

test('WebSocket adapter subscribes, decodes binary reports, reconnects and stops cleanly', async (context) => {
  const provider = new WebSocketServer({ host: '127.0.0.1', port: 0, perMessageDeflate: true });
  await once(provider, 'listening');
  const store = new VesselStore({ live: true, startedAt: now });
  let connections = 0;
  let subscription: Record<string, unknown> | undefined;
  let negotiatedCompression = false;
  provider.on('connection', (socket) => {
    connections += 1;
    negotiatedCompression = socket.extensions.includes('permessage-deflate');
    socket.on('message', (data) => {
      subscription = JSON.parse(data.toString()) as Record<string, unknown>;
      socket.send(JSON.stringify({ MessageType: 'SubscriptionConfirmation', Message: { CompressionEnabled: true } }));
      socket.send(Buffer.from(JSON.stringify(report())));
    });
  });
  const stream = startAisStream(store, { apiKey: 'test-private-key', endpoint: `ws://127.0.0.1:${(provider.address() as AddressInfo).port}`, reconnectBaseMs: 10, heartbeatMs: 50, handshakeTimeoutMs: 1_000 });
  context.after(async () => {
    stream.stop();
    for (const client of provider.clients) client.terminate();
    await new Promise<void>((resolve) => provider.close(() => resolve()));
  });
  await waitFor(() => store.getVessel(innovation.imo)?.source === 'live');
  assert.equal(subscription?.APIKey, 'test-private-key');
  assert.deepEqual(subscription?.BoundingBoxes, [[[-90, -180], [90, 180]]]);
  assert.deepEqual(subscription?.FiltersShipMMSI, vesselRegistry.map((vessel) => vessel.mmsi));
  assert.deepEqual(subscription?.FilterMessageTypes, ['PositionReport']);
  assert.equal(negotiatedCompression, true);
  assert.equal(store.getFleet().streamStatus, 'connected');
  assert.equal(JSON.stringify(store.getVessel(innovation.imo)).includes('test-private-key'), false);
  for (const client of provider.clients) client.terminate();
  await waitFor(() => connections >= 2 && store.getFleet().streamStatus === 'connected');
  assert.equal(store.getVessel(innovation.imo)?.position?.speed, 17.2);
  stream.stop();
  await delay(100);
  const countAfterStop = connections;
  await delay(100);
  assert.equal(connections, countAfterStop);
});

test('provider authentication errors never populate demo positions in live mode', async (context) => {
  const provider = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(provider, 'listening');
  provider.on('connection', (socket) => {
    socket.on('message', () => socket.send(JSON.stringify({ error: 'invalid test-private-key' })));
  });
  const store = new VesselStore({ live: true });
  const stream = startAisStream(store, { apiKey: 'test-private-key', endpoint: `ws://127.0.0.1:${(provider.address() as AddressInfo).port}`, reconnectBaseMs: 1_000 });
  context.after(async () => {
    stream.stop();
    for (const client of provider.clients) client.terminate();
    await new Promise<void>((resolve) => provider.close(() => resolve()));
  });
  await waitFor(() => store.getFleet().streamStatus === 'reconnecting');
  const vessel = store.getVessel(innovation.imo)!;
  assert.equal(vessel.source, 'waiting');
  assert.equal(vessel.position, undefined);
  assert.equal(JSON.stringify(vessel).includes('test-private-key'), false);
});
