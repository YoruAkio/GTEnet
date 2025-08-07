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

class ENetHost {
  constructor() {
    this.native = new enet.ENet();
    this.peers = new Map();
    this.eventCallbacks = {
      connect: [],
      disconnect: [],
      receive: [],
    };
  }

  initialize() {
    return this.native.initialize();
  }

  deinitialize() {
    this.native.deinitialize();
  }

  createServer(address = '127.0.0.1', port = 7777, options = {}) {
    const config = { address, port };
    const defaultOptions = {
      peerCount: 32,
      channelLimit: 2,
      incomingBandwidth: 0,
      outgoingBandwidth: 0,
    };

    return this.native.createHost(config, { ...defaultOptions, ...options });
  }

  createClient(options = {}) {
    const defaultOptions = {
      peerCount: 1,
      channelLimit: 2,
      incomingBandwidth: 0,
      outgoingBandwidth: 0,
    };

    return this.native.createHost(null, { ...defaultOptions, ...options });
  }

  connect(address, port, channelCount = 2, data = 0) {
    const peerId = this.native.connect(address, port, channelCount, data);
    if (peerId) {
      this.peers.set(peerId, { address, port, connected: false });
    }
    return peerId;
  }

  disconnect(peerId, data = 0) {
    this.native.disconnect(peerId, data);
    this.peers.delete(peerId);
  }

  send(peerId, channelId, data, reliable = true) {
    const flags = reliable ? 1 : 0; // ENET_PACKET_FLAG_RELIABLE = 1
    return this.native.sendPacket(peerId, channelId, data, flags);
  }

  service(timeout = 0) {
    const event = this.native.hostService(timeout);
    if (event) {
      this.handleEvent(event);
    }
    return event;
  }

  handleEvent(event) {
    switch (event.type) {
      case 'connect':
        if (this.peers.has(event.peer)) {
          this.peers.get(event.peer).connected = true;
        }
        this.emit('connect', event);
        break;
      case 'disconnect':
        if (this.peers.has(event.peer)) {
          this.peers.get(event.peer).connected = false;
        }
        this.emit('disconnect', event);
        break;
      case 'receive':
        this.emit('receive', event);
        break;
    }
  }

  on(eventType, callback) {
    if (this.eventCallbacks[eventType]) {
      this.eventCallbacks[eventType].push(callback);
    }
  }

  emit(eventType, data) {
    if (this.eventCallbacks[eventType]) {
      this.eventCallbacks[eventType].forEach(callback => callback(data));
    }
  }

  destroy() {
    this.native.destroyHost();
    this.peers.clear();
  }

  // Helper method to run the event loop
  async startEventLoop(interval = 1) {
    this.running = true;
    while (this.running) {
      this.service(interval);
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  stopEventLoop() {
    this.running = false;
  }
}

// Constants for packet flags
export const PACKET_FLAG_RELIABLE = 1;
export const PACKET_FLAG_UNSEQUENCED = 2;
export const PACKET_FLAG_NO_ALLOCATE = 4;
export const PACKET_FLAG_UNRELIABLE_FRAGMENT = 8;
export const PACKET_FLAG_SENT = 256;

export { ENetHost };
export default ENetHost;
