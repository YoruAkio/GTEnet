import { createRequire } from 'module';
import { createSocket } from 'dgram';
const require = createRequire(import.meta.url);

let enet;
try {
  // @note load native addon (node-gyp build output)
  enet = require('./build/Release/enet.node');
} catch (err) {
  console.error(
    'Failed to load ENet native module. Please run "npm run build" first.',
  );
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
          resolve(false);
        } else {
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

  async listen() {
    // @note simple loop: poll service and yield briefly
    this.running = true;
    while (this.running) {
      try {
        this.service(1);
        await new Promise(resolve => setTimeout(resolve, 1));
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

  // @note convenience helper to create and initialize server
  static async create(options = {}) {
    const server = new Server(options);
    await server.createServer();
    return server;
  }

  // @note start server loop
  async start() {
    return this.listen();
  }

  // @note override to emit 'ready' when listening
  async listen() {
    if (!this.hostCreated) {
      await this.createServer();
    }

    // @note signal readiness on next tick
    process.nextTick(() => {
      this.emit('ready');
    });

    // @note delegate to base loop
    return super.listen();
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

  connect() {
    try {
      const peerId = this.native.connect(
        this.config.ip,
        this.config.port,
        this.config.channelLimit,
        0,
      );

      if (peerId) {
        this.serverPeer = peerId;
        this.peers.set(peerId, {
          address: this.config.ip,
          port: this.config.port,
          connected: false,
        });
      }
      return peerId;
    } catch (err) {
      this.emit('error', err);
      return null;
    }
  }

  async listen() {
    // @note connect first
    this.connect();

    // @note then start event loop
    await super.listen();
  }

  sendToServer(channelId, data, reliable = true) {
    if (this.serverPeer) {
      return this.send(this.serverPeer, channelId, data, reliable);
    } else {
      this.emit('error', new Error('Not connected to server'));
      return -1;
    }
  }

  sendRawToServer(channelId, data, flags = PACKET_FLAG_RELIABLE) {
    if (this.serverPeer) {
      return this.sendRawPacket(this.serverPeer, channelId, data, flags);
    } else {
      this.emit('error', new Error('Not connected to server'));
      return -1;
    }
  }

  disconnectFromServer(data = 0) {
    if (this.serverPeer) {
      this.disconnect(this.serverPeer, data);
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
