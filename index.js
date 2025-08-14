import { createRequire } from 'module';
import { createSocket } from 'dgram';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let enet;
try {
  // @note load native addon via node-gyp-build (uses prebuilds or local build)
  // @note falls back to building if no prebuild is available when paired with install script
  enet = require('node-gyp-build')(__dirname);
} catch (err) {
  console.error('Failed to load ENet native module.', 'This usually means:');
  console.error('1. No prebuilt binary available for your platform');
  console.error('2. Missing build tools for local compilation');
  console.error('3. Package installation was incomplete');
  console.error('\nTry running: npm rebuild gtenet');
  console.error('Or install build tools and run: npm run build');
  throw err;
}

/**
 * base wrapper for common enet host/peer management and event dispatch
 */
class ENetBase {
  constructor() {
    // @note set up native handle, peer map, and event callback registry
    this.native = new enet.ENet();
    this.peers = new Map();
    this.eventCallbacks = {
      connect: [],
      disconnect: [],
      receive: [],
      error: [],
    };
    this.running = false;
    this.hostCreated = false;
  }

  initialize() {
    const result = this.native.initialize();
    if (!result) {
      this.emit('error', new Error('Failed to initialize ENet'));
      return false;
    }
    return result;
  }

  deinitialize() {
    this.native.deinitialize();
  }

  on(eventType, callback) {
    if (this.eventCallbacks[eventType]) {
      this.eventCallbacks[eventType].push(callback);
    }
    // @note chainable api
    return this;
  }

  off(eventType, callback) {
    const list = this.eventCallbacks[eventType];
    if (list) {
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    }
    return this;
  }

  once(eventType, callback) {
    const wrapped = data => {
      this.off(eventType, wrapped);
      try {
        callback(data);
      } catch (err) {
        console.error('Error in once callback:', err);
      }
    };
    return this.on(eventType, wrapped);
  }

  emit(eventType, data) {
    if (this.eventCallbacks[eventType]) {
      this.eventCallbacks[eventType].forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error('Error in event callback:', err);
        }
      });
    }
  }

  setupHost(config, isServer = false) {
    // @note enable compression and checksum
    this.native.setCompression(true);
    this.native.setChecksum(true);

    // @note optionally enable new packet mode
    if (config.usingNewPacket || config.usingNewPacketForServer) {
      this.native.setNewPacket(true, isServer);
    }
  }

  // @note check if a udp port is available
  async checkPortAvailable(port, host = '127.0.0.1') {
    return new Promise(resolve => {
      const socket = createSocket('udp4');

      socket.bind(port, host, () => {
        socket.close(() => {
          resolve(true);
        });
      });

      socket.on('error', err => {
        if (err.code === 'EADDRINUSE') {
          try { socket.close(); } catch {}
          resolve(false);
        } else {
          try { socket.close(); } catch {}
          resolve(false);
        }
      });
    });
  }

  service(timeout = 0) {
    // @note poll native host and forward events
    if (!this.hostCreated) {
      return null;
    }
    const event = this.native.hostService(timeout);
    if (event) {
      this.handleEvent(event);
    }
    return event;
  }

  handleEvent(event) {
    // @note update internal state and re-emit
    try {
      switch (event.type) {
        case 'connect':
          if (this.peers.has(event.peer)) {
            this.peers.get(event.peer).connected = true;
          } else {
            this.peers.set(event.peer, { connected: true });
          }
          this.emit('connect', event);
          break;
        case 'disconnect':
          if (this.peers.has(event.peer)) {
            const peer = this.peers.get(event.peer);
            peer.connected = false;
            // @note remove peer record
            this.peers.delete(event.peer);
          }
          this.emit('disconnect', event);
          break;
        case 'receive':
          this.emit('receive', event);
          break;
        default:
          this.emit('error', new Error(`Unknown event type: ${event.type}`));
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  send(peerId, channelId, data, reliable = true) {
    try {
      // @note enet reliable flag is 1; 0 is unreliable
      const flags = reliable ? 1 : 0;
      return this.native.sendPacket(peerId, channelId, data, flags);
    } catch (err) {
      this.emit('error', err);
      return -1;
    }
  }

  sendRawPacket(peerId, channelId, data, flags = PACKET_FLAG_RELIABLE) {
    // @note send raw binary payload (Buffer/TypedArray/ArrayBuffer)
    try {
      return this.native.sendRawPacket(peerId, channelId, data, flags);
    } catch (err) {
      this.emit('error', err);
      return -1;
    }
  }

  disconnect(peerId, data = 0) {
    // @note request graceful disconnect and clean up
    try {
      this.native.disconnect(peerId, data);
      this.peers.delete(peerId);
    } catch (err) {
      this.emit('error', err);
    }
  }

  destroy() {
    // @note destroy host and reset local state
    try {
      this.native.destroyHost();
      this.peers.clear();
      this.hostCreated = false;
    } catch (err) {
      this.emit('error', err);
    }
  }

  async listen(pollIntervalMs = 2, maxPollIntervalMs = 32) {
    // @note simple loop: poll service and yield briefly (configurable interval)
    this.running = true;
    let currentInterval = pollIntervalMs;
    while (this.running) {
      try {
        const event = this.service(currentInterval);
        if (event) {
          currentInterval = pollIntervalMs;
        } else {
          currentInterval = Math.min(currentInterval * 2, maxPollIntervalMs);
        }
        await new Promise(resolve => setTimeout(resolve, currentInterval));
      } catch (err) {
        this.emit('error', err);
        break;
      }
    }
  }

  stop() {
    // @note stop listen loop
    this.running = false;
  }

  flush() {
    // @note flush outgoing commands immediately
    try {
      this.native.flush();
    } catch (err) {
      this.emit('error', err);
    }
  }
}

/**
 * enet server: create host bound to address/port and accept peers
 */
class Server extends ENetBase {
  constructor(options = {}) {
    super();

    // @note add 'ready' event for server lifecycle
    this.eventCallbacks.ready = [];

    // @note default configuration
    const config = {
      ip: options.ip || options.address || '127.0.0.1',
      port: options.port || 17091,
      maxPeer: options.maxPeer || 32,
      channelLimit: options.channelLimit || 2,
      usingNewPacketForServer:
        options.usingNewPacketForServer !== undefined
          ? options.usingNewPacketForServer
          : false,
      incomingBandwidth: options.incomingBandwidth || 0,
      outgoingBandwidth: options.outgoingBandwidth || 0,
    };

    this.config = config;
    this.initialize();
  }

  async createServer() {
    try {
      // @note ensure port is free before binding
      const isPortAvailable = await this.checkPortAvailable(
        this.config.port,
        this.config.ip,
      );
      if (!isPortAvailable) {
        const error = new Error(
          `Port ${this.config.port} is already in use on ${this.config.ip}`,
        );
        this.emit('error', error);
        throw error;
      }

      const hostConfig = {
        address: this.config.ip,
        port: this.config.port,
      };

      const hostOptions = {
        peerCount: this.config.maxPeer,
        channelLimit: this.config.channelLimit,
        incomingBandwidth: this.config.incomingBandwidth,
        outgoingBandwidth: this.config.outgoingBandwidth,
      };

      const result = this.native.createHost(hostConfig, hostOptions);
      if (!result) {
        throw new Error('Failed to create server host');
      }

      // @note apply compression/checksum/new packet options
      this.setupHost(this.config, true);

      this.hostCreated = true;

      return true;
    } catch (err) {
      this.emit('error', err);
      // @note rethrow so caller can handle
      throw err;
    }
  }

  broadcast(channelId, data, reliable = true) {
    for (const [peerId, peerInfo] of this.peers) {
      if (peerInfo && peerInfo.connected) {
        try {
          super.send(peerId, channelId, data, reliable);
        } catch (err) {
          this.emit('error', err);
        }
      }
    }
  }

  // @note convenience helper to create and initialize server
  static async create(options = {}) {
    const server = new Server(options);
    await server.createServer();
    return server;
  }

  // @note start server loop
  async listen(pollIntervalMs = 2, maxPollIntervalMs = 32) {
    if (!this.hostCreated) {
      await this.createServer();
    }

    // @note signal readiness on next tick
    process.nextTick(() => {
      this.emit('ready');
    });

    // @note delegate to base loop
    return super.listen(pollIntervalMs, maxPollIntervalMs);
  }
}

/**
 * enet client: create unbound host and connect to server
 */
class Client extends ENetBase {
  constructor(options = {}) {
    super();

    // @note default configuration
    const config = {
      ip: options.ip || options.address || '127.0.0.1',
      port: options.port || 17091,
      channelLimit: options.channelLimit || 2,
      usingNewPacket:
        options.usingNewPacket !== undefined ? options.usingNewPacket : false,
      incomingBandwidth: options.incomingBandwidth || 0,
      outgoingBandwidth: options.outgoingBandwidth || 0,
    };

    this.config = config;
    this.serverPeer = null;
    this.initialize();
    this.createClient();
  }

  createClient() {
    try {
      const hostOptions = {
        peerCount: 1,
        channelLimit: this.config.channelLimit,
        incomingBandwidth: this.config.incomingBandwidth,
        outgoingBandwidth: this.config.outgoingBandwidth,
      };

      const result = this.native.createHost(null, hostOptions);
      if (!result) {
        throw new Error('Failed to create client host');
      }

      // @note apply compression/checksum/new packet options
      this.setupHost(this.config, false);
      this.hostCreated = true;

      console.log('Client created successfully');
    } catch (err) {
      this.emit('error', err);
      // @note rethrow so caller can handle
      throw err;
    }
  }

  async connect(options = {}) {
    try {
      if (!this.hostCreated) {
        this.createClient();
      }

      const peerId = this.native.connect(
        this.config.ip,
        this.config.port,
        this.config.channelLimit,
        0,
      );

      if (peerId) {
        this.serverPeer = peerId; // bigint from native
        this.peers.set(peerId, {
          address: this.config.ip,
          port: this.config.port,
          connected: false,
        });
      }

      // @note if timeout requested, start loop in background and await connect or timeout
      const timeoutMs = options && typeof options.timeoutMs === 'number' ? options.timeoutMs : 0;
      if (timeoutMs > 0) {
        if (!this.running) {
          // start event loop without awaiting
          (async () => {
            try { await super.listen(); } catch (err) { this.emit('error', err); }
          })();
        }
        await new Promise((resolve, reject) => {
          let timer = null;
          const onConnected = evt => {
            if (this.serverPeer && evt && evt.peer === this.serverPeer) {
              if (timer) clearTimeout(timer);
              this.off('connect', onConnected);
              resolve();
            }
          };
          this.once('connect', onConnected);
          timer = setTimeout(() => {
            this.off('connect', onConnected);
            reject(new Error('Connect timeout'));
          }, timeoutMs);
        });
      } else {
        // @note start processing events and block
        await super.listen();
      }
    } catch (err) {
      this.emit('error', err);
    }
  }



  // Override to send to the connected server peer by default
  send(channelId, data, reliable = true) {
    if (this.serverPeer) {
      return super.send(this.serverPeer, channelId, data, reliable);
    } else {
      this.emit('error', new Error('Not connected to server'));
      return -1;
    }
  }

  // Override to send raw packets to the connected server peer by default
  sendRawPacket(channelId, data, flags = PACKET_FLAG_RELIABLE) {
    if (this.serverPeer) {
      return super.sendRawPacket(this.serverPeer, channelId, data, flags);
    } else {
      this.emit('error', new Error('Not connected to server'));
      return -1;
    }
  }

  // Override to disconnect from the connected server peer by default
  disconnect(data = 0) {
    if (this.serverPeer) {
      super.disconnect(this.serverPeer, data);
      this.serverPeer = null;
    }
  }
}

// @note packet flag constants
export const PACKET_FLAG_RELIABLE = 1;
export const PACKET_FLAG_UNSEQUENCED = 2;
export const PACKET_FLAG_NO_ALLOCATE = 4;
export const PACKET_FLAG_UNRELIABLE_FRAGMENT = 8;
export const PACKET_FLAG_SENT = 256;

/**
 * helper to build raw binary payloads for sendRawPacket
 */
export class RawPacketBuilder {
  constructor(size = 1024) {
    this.buffer = new ArrayBuffer(size);
    this.view = new DataView(this.buffer);
    this.offset = 0;
  }

  // @note write helpers for primitive types
  writeUint8(value) {
    this.view.setUint8(this.offset, value);
    this.offset += 1;
    return this;
  }

  writeUint16(value, littleEndian = true) {
    this.view.setUint16(this.offset, value, littleEndian);
    this.offset += 2;
    return this;
  }

  writeUint32(value, littleEndian = true) {
    this.view.setUint32(this.offset, value, littleEndian);
    this.offset += 4;
    return this;
  }

  writeFloat32(value, littleEndian = true) {
    this.view.setFloat32(this.offset, value, littleEndian);
    this.offset += 4;
    return this;
  }

  writeFloat64(value, littleEndian = true) {
    this.view.setFloat64(this.offset, value, littleEndian);
    this.offset += 8;
    return this;
  }

  writeString(str, encoding = 'utf8') {
    if (encoding && encoding !== 'utf8') {
      // @note only utf8 is supported via TextEncoder
      throw new Error('RawPacketBuilder.writeString supports only utf8 encoding');
    }
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    const uint8Array = new Uint8Array(this.buffer, this.offset);
    uint8Array.set(encoded);
    this.offset += encoded.length;
    return this;
  }

  writeBytes(bytes) {
    const uint8Array = new Uint8Array(this.buffer, this.offset);
    uint8Array.set(bytes);
    this.offset += bytes.length;
    return this;
  }

  // @note get final packet data up to offset
  getPacketData() {
    return this.buffer.slice(0, this.offset);
  }

  // @note reset for reuse
  reset() {
    this.offset = 0;
    return this;
  }

  // @note current size in bytes
  size() {
    return this.offset;
  }
}

export { Client, Server };
export default { Client, Server };
