import 'dotenv/config';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { startAisStream } from './ais/aisStream.js';
import { VesselStore } from './store.js';

const apiKey = process.env.AISSTREAM_API_KEY?.trim();
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer between 1 and 65535.');
const store = new VesselStore({ live: Boolean(apiKey) });
const app = createApp(store, { clientDir: process.env.NODE_ENV === 'production' ? resolve('dist') : undefined });
const stream = apiKey ? startAisStream(store, { apiKey }) : undefined;
const server = app.listen(port, () => {
  console.info(`ONE Vessel Tracker API listening on http://localhost:${port} (${store.mode} mode)`);
});

function shutdown() {
  stream?.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}
server.on('error', () => {
  console.error('Unable to start HTTP server. Check PORT and whether it is already in use.');
  stream?.stop();
  process.exitCode = 1;
});
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
