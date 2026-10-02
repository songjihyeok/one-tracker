/// <reference path="../worker-configuration.d.ts" />

import { VesselStore } from '../server/store.js';

function json(request: Request, value: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname.replace(/\/$/, '');
    const isApi = pathname === '/api' || pathname.startsWith('/api/');
    try {
      if (!isApi) return await env.ASSETS.fetch(request);
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json(request, { error: 'Method not allowed.' }, 405, { Allow: 'GET, HEAD' });
      }

      const startedAt = Date.parse(env.DEMO_STARTED_AT);
      if (!Number.isFinite(startedAt)) {
        console.error(JSON.stringify({ event: 'invalid_demo_snapshot_configuration' }));
        return json(request, { error: 'The demo snapshot is unavailable.' }, 503);
      }
      // A fixed configured snapshot remains identical across requests and Worker isolates.
      // This deployment is demo-only: no persistent AIS socket is created in a request.
      const store = new VesselStore({ live: false, startedAt });
      if (pathname === '/api/health') {
        return json(request, { status: 'ok', mode: 'demo', streamStatus: 'demo' });
      }
      if (pathname === '/api/vessels') return json(request, store.getFleet());

      const match = /^\/api\/vessels\/([^/]+)$/.exec(pathname);
      if (match) {
        let imo: string;
        try {
          imo = decodeURIComponent(match[1]);
        } catch {
          return json(request, { error: 'Invalid IMO number. Expected seven digits.' }, 400);
        }
        if (!/^\d{7}$/.test(imo)) return json(request, { error: 'Invalid IMO number. Expected seven digits.' }, 400);
        const vessel = store.getVessel(imo);
        return vessel ? json(request, vessel) : json(request, { error: 'Vessel not found.' }, 404);
      }
      // API misses must never reach the SPA's index.html fallback.
      return json(request, { error: 'API endpoint not found.' }, 404);
    } catch {
      // Log an event only; exceptions or binding values could contain private details.
      console.error(JSON.stringify({ event: 'worker_request_failed', scope: isApi ? 'api' : 'assets' }));
      return json(request, { error: 'An unexpected server error occurred.' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
