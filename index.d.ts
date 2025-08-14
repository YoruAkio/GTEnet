// @note type declarations for gtenet to improve editor intellisense

export type PeerId = bigint;

export interface ConnectEvent {
  type: 'connect';
  peer: PeerId;
}

export interface DisconnectEvent {
  type: 'disconnect';
  peer: PeerId;
  data: number;
}

export interface ReceiveEvent {
  type: 'receive';
  peer: PeerId;
  channelID: number;
  data: Buffer;
}

export interface UnknownEvent {
  type: 'unknown';
}

export type ENetEvent = ConnectEvent | DisconnectEvent | ReceiveEvent | UnknownEvent;

export type BaseEventName = 'connect' | 'disconnect' | 'receive' | 'error';

export interface ServerOptions {
  ip?: string;
  address?: string;
  port?: number;
  maxPeer?: number;
  channelLimit?: number;
  usingNewPacketForServer?: boolean;
  incomingBandwidth?: number;
  outgoingBandwidth?: number;
}

export interface ClientOptions {
  ip?: string;
  address?: string;
  port?: number;
  channelLimit?: number;
  usingNewPacket?: boolean;
  incomingBandwidth?: number;
  outgoingBandwidth?: number;
}

/**
 * High-level ENet server wrapper
 */
export class Server {
  constructor(options?: ServerOptions);

  // @note event subscriptions
  on(event: 'connect', handler: (event: ConnectEvent) => void): this;
  on(event: 'disconnect', handler: (event: DisconnectEvent) => void): this;
  on(event: 'receive', handler: (event: ReceiveEvent) => void): this;
  on(event: 'error', handler: (error: Error) => void): this;
  on(event: 'ready', handler: () => void): this;

  // @note lifecycle
  initialize(): boolean;
  deinitialize(): void;
  destroy(): void;

  // @note host/event loop
  service(timeout?: number): ENetEvent | null;
  listen(): Promise<void>;
  stop(): void;

  // @note server setup
  createServer(): Promise<boolean>;
  start(): Promise<void>;
  static create(options?: ServerOptions): Promise<Server>;

  // @note data and connections
  send(peerId: PeerId, channelId: number, data: Buffer | string, reliable?: boolean): number;
  sendRawPacket(peerId: PeerId, channelId: number, data: Buffer | Uint8Array | ArrayBuffer, flags?: number): number;
  disconnect(peerId: PeerId, data?: number): void;
}

/**
 * High-level ENet client wrapper
 */
export class Client {
  constructor(options?: ClientOptions);

  // @note event subscriptions
  on(event: 'connect', handler: (event: ConnectEvent) => void): this;
  on(event: 'disconnect', handler: (event: DisconnectEvent) => void): this;
  on(event: 'receive', handler: (event: ReceiveEvent) => void): this;
  on(event: 'error', handler: (error: Error) => void): this;

  // @note lifecycle
  initialize(): boolean;
  deinitialize(): void;
  destroy(): void;

  // @note host/event loop
  service(timeout?: number): ENetEvent | null;
  stop(): void;

  // @note connection helpers
  connect(): Promise<void>;

  // @note instance methods target connected server by default
  send(channelId: number, data: Buffer | string, reliable?: boolean): number;
  sendRawPacket(channelId: number, data: Buffer | Uint8Array | ArrayBuffer, flags?: number): number;
  disconnect(data?: number): void;

  // @note still expose low-level methods via Base class through TS, but Client overrides instance signatures
  // The Client instance methods above shadow the base signatures that include peerId.

  // @note current server peer id if connected
  serverPeer: PeerId | null;
}

/**
 * Utility builder to create raw packet binary payloads
 */
export class RawPacketBuilder {
  constructor(size?: number);
  buffer: ArrayBuffer;
  view: DataView;
  offset: number;

  writeUint8(value: number): this;
  writeUint16(value: number, littleEndian?: boolean): this;
  writeUint32(value: number, littleEndian?: boolean): this;
  writeFloat32(value: number, littleEndian?: boolean): this;
  writeFloat64(value: number, littleEndian?: boolean): this;
  writeString(str: string, encoding?: string): this;
  writeBytes(bytes: Uint8Array): this;
  getPacketData(): ArrayBuffer;
  reset(): this;
  size(): number;
}

// @note packet flags (mirror ENet constants)
export const PACKET_FLAG_RELIABLE: 1;
export const PACKET_FLAG_UNSEQUENCED: 2;
export const PACKET_FLAG_NO_ALLOCATE: 4;
export const PACKET_FLAG_UNRELIABLE_FRAGMENT: 8;
export const PACKET_FLAG_SENT: 256;

// @note default export for convenience
export default {
  Client: Client,
  Server: Server
};


