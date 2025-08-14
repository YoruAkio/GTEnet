// @note shared test utilities
import { Server, Client } from '../index.js';

export async function startEchoServer(options = {}) {
  const server = await Server.create({
    address: '127.0.0.1',
    port: options.port ?? 17091,
    usingNewPacketForServer: true,
    maxPeer: options.maxPeer ?? 32,
    channelLimit: options.channelLimit ?? 2,
  });

  server.on('receive', evt => {
    try {
      server.send(evt.peer, evt.channelID, evt.data);
    } catch (err) {
      server.emit('error', err);
    }
  });

  // @note start server loop in background
  (async () => {
    try { await server.listen(2, 32); } catch (err) { server.emit('error', err); }
  })();

  return server;
}

export async function startClient(options = {}) {
  const client = new Client({
    ip: '127.0.0.1',
    port: options.port ?? 17091,
    usingNewPacket: true,
    channelLimit: options.channelLimit ?? 2,
  });

  return client;
}

export async function shutdown(server, client) {
  try {
    client?.disconnect();
  } catch {}
  try {
    client?.stop();
  } catch {}
  try {
    client?.destroy();
  } catch {}
  try {
    client?.deinitialize();
  } catch {}
  try {
    server?.stop();
  } catch {}
  try {
    server?.destroy();
  } catch {}
  try {
    server?.deinitialize();
  } catch {}
} 