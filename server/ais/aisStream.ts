import WebSocket from 'ws';
import { vesselRegistry } from '../../shared/data.js';
import type { VesselStore } from '../store.js';
import { decodePosition, parseFrame } from './decoder.js';

type StreamOptions = {
  apiKey: string;
  endpoint?: string;
  reconnectBaseMs?: number;
  heartbeatMs?: number;
  handshakeTimeoutMs?: number;
};

export function startAisStream(store: VesselStore, {
  apiKey,
  endpoint = 'wss://stream.aisstream.io/v0/stream',
  reconnectBaseMs = 1_000,
  heartbeatMs = 30_000,
  handshakeTimeoutMs = 15_000,
}: StreamOptions): { stop: () => void } {
  let stopped = false;
  let reconnectAttempt = 0;
  let socket: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let subscriptionTimer: ReturnType<typeof setTimeout> | undefined;

  function clearConnectionTimers() {
    clearInterval(heartbeatTimer);
    clearTimeout(subscriptionTimer);
  }

  function connect() {
    if (stopped) return;
    store.setStreamStatus(reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    const current = new WebSocket(endpoint, { perMessageDeflate: true, handshakeTimeout: handshakeTimeoutMs, maxPayload: 1_048_576 });
    socket = current;
    let alive = true;
    current.on('open', () => {
      if (stopped) return current.terminate();
      // The complete subscription must be sent within three seconds of opening.
      current.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [[[-90, -180], [90, 180]]],
        FiltersShipMMSI: vesselRegistry.map((vessel) => vessel.mmsi),
        FilterMessageTypes: ['PositionReport'],
      }), (error) => { if (error) current.terminate(); });
      subscriptionTimer = setTimeout(() => current.terminate(), handshakeTimeoutMs);
      subscriptionTimer.unref();
      heartbeatTimer = setInterval(() => {
        if (!alive) return current.terminate();
        alive = false;
        if (current.readyState === WebSocket.OPEN) current.ping();
      }, heartbeatMs);
      heartbeatTimer.unref();
    });
    current.on('pong', () => { alive = true; });
    current.on('message', (data) => {
      if (stopped) return;
      alive = true;
      const frame = parseFrame(data);
      if (!frame) return;
      if (frame.error !== undefined || frame.Error !== undefined || frame.MessageType === 'Error') {
        // Provider error payloads may contain credentials. Never expose or log them.
        store.setStreamStatus('error');
        current.terminate();
        return;
      }
      if (frame.MessageType === 'SubscriptionConfirmation') {
        clearTimeout(subscriptionTimer);
        reconnectAttempt = 0;
        store.setStreamStatus('connected');
        return;
      }
      const decoded = decodePosition(frame);
      if (decoded && store.updatePosition(decoded.mmsi, decoded.position)) {
        clearTimeout(subscriptionTimer);
        reconnectAttempt = 0;
        store.setStreamStatus('connected');
      }
    });
    current.on('error', () => {
      // ws also emits close; only that handler schedules the retry.
      if (!stopped) store.setStreamStatus('error');
    });
    current.on('close', () => {
      clearConnectionTimers();
      if (stopped) return;
      store.setStreamStatus('reconnecting');
      const delay = Math.min(60_000, reconnectBaseMs * 2 ** Math.min(reconnectAttempt++, 6)) * (0.75 + Math.random() * 0.5);
      reconnectTimer = setTimeout(connect, delay);
      reconnectTimer.unref();
    });
  }

  connect();
  return {
    stop() {
      stopped = true;
      clearTimeout(reconnectTimer);
      clearConnectionTimers();
      socket?.terminate();
    },
  };
}
