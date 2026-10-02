import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { resolve } from 'node:path';
import { VesselStore } from './store.js';

export function createApp(store = new VesselStore(), { clientDir }: { clientDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    response.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/api/health', (_request, response) => {
    const { mode, streamStatus } = store.getFleet();
    response.json({ status: 'ok', mode, streamStatus });
  });
  app.get('/api/vessels', (_request, response) => response.json(store.getFleet()));
  app.get('/api/vessels/:imo', (request, response) => {
    if (!/^\d{7}$/.test(request.params.imo)) {
      response.status(400).json({ error: 'Invalid IMO number. Expected seven digits.' });
      return;
    }
    const vessel = store.getVessel(request.params.imo);
    if (!vessel) {
      response.status(404).json({ error: 'Vessel not found.' });
      return;
    }
    response.json(vessel);
  });
  app.use('/api', (_request, response) => response.status(404).json({ error: 'API endpoint not found.' }));
  if (clientDir) {
    app.use(express.static(resolve(clientDir), { index: false }));
    app.get('/{*path}', (request, response, next) => {
      if (!request.accepts('html')) return next();
      response.sendFile(resolve(clientDir, 'index.html'));
    });
  }
  const handleError: ErrorRequestHandler = (_error, _request, response, next) => {
    if (response.headersSent) return next(_error);
    response.status(500).json({ error: 'An unexpected server error occurred.' });
  };
  app.use(handleError);
  return app;
}
