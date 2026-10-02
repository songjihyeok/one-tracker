import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FleetResponse, Vessel } from '../shared/types.js';
import worker from '../worker/index.js';

function environment(onAsset?: (request: Request) => Promise<Response>): Env {
  return {
    DEMO_STARTED_AT: '2026-10-02T00:00:00.000Z',
    ASSETS: {
      async fetch(input, init) {
        const request = new Request(input, init);
        return onAsset ? onAsset(request) : new Response(request.method === 'HEAD' ? null : '<!doctype html><title>ONE Vessel Tracker</title>', { headers: { 'Content-Type': 'text/html' } });
      },
      connect() { throw new Error('Asset TCP connections are not supported.'); },
    },
  };
}

function request(path: string, method = 'GET', headers?: HeadersInit): Request {
  return new Request(`https://one-tracker.test${path}`, { method, headers });
}

test('Worker preserves the public fleet API and explicitly reports demo data', async () => {
  const env = environment();
  const fleetResponse = await worker.fetch(request('/api/vessels'), env);
  assert.equal(fleetResponse.status, 200);
  assert.equal(fleetResponse.headers.get('Cache-Control'), 'no-store');
  assert.equal(fleetResponse.headers.get('X-Content-Type-Options'), 'nosniff');
  const fleet = await fleetResponse.json() as FleetResponse;
  assert.equal(fleet.vessels.length, 4);
  assert.equal(fleet.mode, 'demo');
  assert.equal(fleet.streamStatus, 'demo');
  for (const summary of fleet.vessels) {
    const response = await worker.fetch(request(`/api/vessels/${summary.imo}?cache-bust=1`), env);
    assert.equal(response.status, 200);
    const vessel = await response.json() as Vessel;
    assert.equal(vessel.imo, summary.imo);
    assert.equal(vessel.source, 'demo');
    assert.equal(vessel.scheduleSource, 'sample');
    assert.equal(vessel.streamStatus, 'demo');
    assert.ok(vessel.position);
    assert.equal(vessel.route.length, 4);
    assert.equal('ASSETS' in vessel, false);
    assert.equal('DEMO_STARTED_AT' in vessel, false);
  }
  assert.deepEqual(await (await worker.fetch(request('/api/health/'), env)).json(), { status: 'ok', mode: 'demo', streamStatus: 'demo' });
});

test('Worker demo observations and schedules stay fixed across time, requests and fresh environments', async (context) => {
  const first = await (await worker.fetch(request('/api/vessels/9939137'), environment())).json() as Vessel;
  context.mock.method(Date, 'now', () => Date.parse('2030-10-02T00:00:00Z'));
  const second = await (await worker.fetch(request('/api/vessels/9939137'), environment())).json() as Vessel;
  assert.deepEqual(second, first);
  assert.equal(first.position?.updatedAt, '2026-10-01T23:58:00.000Z');
  assert.equal(first.route[1].eta, '2026-10-02T18:00:00.000Z');
});

test('Worker rejects malformed or missing API routes without passing them to the SPA binding', async () => {
  let assetRequests = 0;
  const env = environment(async () => { assetRequests += 1; return new Response('SPA must not handle APIs'); });
  for (const path of ['/api/vessels/bad', '/api/vessels/123', '/api/vessels/%E0%A4%A', '/api/vessels/%2F']) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 400, path);
    assert.match(response.headers.get('Content-Type')!, /application\/json/);
  }
  for (const path of ['/api', '/api/', '/api/missing', '/api/vessels/1111111', '/api/vessels/9939137/extra']) {
    const response = await worker.fetch(request(path, 'GET', { 'Sec-Fetch-Mode': 'navigate', Accept: 'text/html' }), env);
    assert.equal(response.status, 404, path);
    assert.match(response.headers.get('Content-Type')!, /application\/json/);
    assert.ok((await response.json() as { error?: string }).error);
  }
  assert.equal(assetRequests, 0);
  assert.equal((await worker.fetch(request('/api/vessels/%39939137'), env)).status, 200);
});

test('Worker supports bodyless HEAD and returns Allow for unsupported API methods', async () => {
  const env = environment();
  for (const path of ['/api/health', '/api/vessels', '/api/vessels/9939137', '/api/vessels/bad', '/api/missing']) {
    const get = await worker.fetch(request(path), env);
    const head = await worker.fetch(request(path, 'HEAD'), env);
    assert.equal(head.status, get.status, path);
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('Content-Type'), get.headers.get('Content-Type'));
    assert.equal(head.headers.get('Cache-Control'), 'no-store');
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await worker.fetch(request('/api/vessels', method), env);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), 'GET, HEAD');
  }
});

test('non-API requests retain their URL and method through the generated ASSETS binding', async () => {
  const requested: string[] = [];
  const env = environment(async (assetRequest) => {
    requested.push(`${assetRequest.method} ${assetRequest.url}`);
    return new Response(assetRequest.method === 'HEAD' ? null : '<!doctype html><title>ONE Vessel Tracker</title>', { headers: { 'Content-Type': 'text/html', 'X-Asset-Test': 'yes' } });
  });
  for (const path of ['/', '/voyages/saved', '/assets/app.js', '/apiculture']) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Asset-Test'), 'yes');
    assert.match(await response.text(), /ONE Vessel Tracker/);
  }
  const head = await worker.fetch(request('/voyages/saved', 'HEAD'), env);
  assert.equal(await head.text(), '');
  assert.equal(requested.at(-1), 'HEAD https://one-tracker.test/voyages/saved');
  assert.equal(requested.length, 5);
});

test('invalid snapshot configuration fails explicitly instead of generating a fresh timestamp', async (context) => {
  const log = context.mock.method(console, 'error', () => undefined);
  const env = environment();
  // Deliberately inject a runtime misconfiguration beyond the generated literal type.
  Reflect.set(env, 'DEMO_STARTED_AT', 'not-a-date');
  const response = await worker.fetch(request('/api/vessels/9939137'), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'The demo snapshot is unavailable.' });
  assert.match(String(log.mock.calls[0].arguments[0]), /invalid_demo_snapshot_configuration/);
});

test('asset errors produce a generic response and logs without exposing exception details', async (context) => {
  const logs: string[] = [];
  context.mock.method(console, 'error', (message: string) => { logs.push(message); });
  const env = environment(async () => { throw new Error('private-upstream-token'); });
  const response = await worker.fetch(request('/voyages/saved'), env);
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes('private-upstream-token'), false);
  assert.equal(logs.join('').includes('private-upstream-token'), false);
  assert.deepEqual(JSON.parse(logs[0]), { event: 'worker_request_failed', scope: 'assets' });
});
