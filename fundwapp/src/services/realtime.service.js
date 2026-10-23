import { EventEmitter } from 'node:events';

// In-process pub/sub that feeds the Server-Sent-Events stream on public fundraiser pages (SDD 4.1 step 6).
// Running more than one server instance? Browsers also poll every few seconds as a fallback, so totals
// still converge; swap this module for Redis/NATS pub/sub when you need instant cross-instance pushes.
const bus = new EventEmitter();
bus.setMaxListeners(0);

export const publish = (fundraiserId, payload) => bus.emit(`fundraiser:${fundraiserId}`, payload);

export function subscribe(fundraiserId, listener) {
  const channel = `fundraiser:${fundraiserId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}
