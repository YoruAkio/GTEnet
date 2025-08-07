import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let enet;
try {
  enet = require('./build/Release/enet.node');
} catch (err) {
  console.error(
    'Failed to load ENet native module. Please run "npm run build" first.',
  );
  throw err;
}

// Base class for common functionality
class ENetBase {
  constructor() {
    this.native = new enet.ENet();
    this.peers = new Map();
    this.eventCallbacks = {
      connect: [],
      disconnect: [],
      receive: [],
      error: [],
    };
    this.running = false;
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
    return this; // For chaining
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
    // Set compression and checksum
    this.native.setCompression(true);
    this.native.setChecksum(true);

    // Set new packet mode
    if (config.usingNewPacket || config.usingNewPacketForServer) {
      this.native.setNewPacket(true, isServer);
    }
  }

  service(timeout = 0) {
    const event = this.native.hostService(timeout);
    if (event) {
      this.handleEvent(event);
    }
    return event;
  }

  handleEvent(event) {
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
            // Clean up peer data
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
      const flags = reliable ? 1 : 0; // ENET_PACKET_FLAG_RELIABLE = 1
      return this.native.sendPacket(peerId, channelId, data, flags);
    } catch (err) {
      this.emit('error', err);
      return -1;
    }
  }

  disconnect(peerId, data = 0) {
    try {
      this.native.disconnect(peerId, data);
      this.peers.delete(peerId);
    } catch (err) {
      this.emit('error', err);
    }
  }

  destroy() {
    try {
      this.native.destroyHost();
      this.peers.clear();
    } catch (err) {
      this.emit('error', err);
    }
  }

  async listen() {
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
    this.running = false;
  }
}

// Server class
class Server extends ENetBase {
  constructor(options = {}) {
    super();

    // Default configuration
    const config = {
      ip: options.ip || '127.0.0.1',
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
    this.createServer();
  }

  createServer() {
    try {
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

      // Setup host with compression, checksum, and new packet mode
      this.setupHost(this.config, true);
    } catch (err) {
      this.emit('error', err);
    }
  }
}

// Client class
class Client extends ENetBase {
  constructor(options = {}) {
    super();

    // Default configuration
    const config = {
      ip: options.ip || '127.0.0.1',
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

      // Setup host with compression, checksum, and new packet mode
      this.setupHost(this.config, false);
    } catch (err) {
      this.emit('error', err);
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
    // Connect to server first
    this.connect();

    // Start event loop
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

  disconnectFromServer(data = 0) {
    if (this.serverPeer) {
      this.disconnect(this.serverPeer, data);
      this.serverPeer = null;
    }
  }
}

// Constants for packet flags
export const PACKET_FLAG_RELIABLE = 1;
export const PACKET_FLAG_UNSEQUENCED = 2;
export const PACKET_FLAG_NO_ALLOCATE = 4;
export const PACKET_FLAG_UNRELIABLE_FRAGMENT = 8;
export const PACKET_FLAG_SENT = 256;

export { Client, Server };
export default { Client, Server };
