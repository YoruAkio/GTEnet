# ENetJS

A Node.js binding for the ENet reliable UDP networking library. This project allows you to use ENet's fast and reliable networking capabilities directly from Node.js.

## Features

- **Reliable UDP**: Get the speed of UDP with the reliability of TCP
- **Cross-platform**: Works on Linux, Windows, and macOS
- **Event-driven**: Modern JavaScript API with event callbacks
- **High Performance**: Direct bindings to the native ENet library

## Installation

First, install the dependencies:

```bash
npm install
```

Then build the native module:

```bash
npm run build
```

## Quick Start

### Running the Examples

Start a server:

```bash
npm run server
```

In another terminal, start a client:

```bash
npm run client
```

### Basic Usage

```javascript
import { Client, Server } from './index.js';

// Create a server
const server = new Server({
  ip: '127.0.0.1', // optional, default: '127.0.0.1'
  port: 17091, // optional, default: 17091
  maxPeer: 32, // optional, default: 32
  channelLimit: 2, // optional, default: 2
  usingNewPacketForServer: false, // optional, default: false
  incomingBandwidth: 0, // optional, default: 0
  outgoingBandwidth: 0, // optional, default: 0
});

// Set up event handlers with chaining
server
  .on('connect', event => {
    console.log('Client connected:', event.peer);
  })
  .on('disconnect', event => {
    console.log('Client disconnected:', event.peer);
  })
  .on('receive', event => {
    console.log('Received:', event.data.toString());
    server.send(event.peer, 0, 'Reply message');
  })
  .on('error', err => {
    console.error('Server error:', err);
  });

// Start listening
server.listen();

// Create a client
const client = new Client({
  ip: '127.0.0.1', // optional, default: '127.0.0.1'
  port: 17091, // optional, default: 17091
  channelLimit: 2, // optional, default: 2
  usingNewPacket: false, // optional, default: false
  incomingBandwidth: 0, // optional, default: 0
  outgoingBandwidth: 0, // optional, default: 0
});

// Set up event handlers
client
  .on('connect', event => {
    console.log('Connected to server!');
    client.sendToServer(0, 'Hello Server!');
  })
  .on('disconnect', event => {
    console.log('Disconnected from server');
  })
  .on('receive', event => {
    console.log('Server says:', event.data.toString());
  })
  .on('error', err => {
    console.error('Client error:', err);
  });

// Start listening (connects automatically)
client.listen();
```

## API Reference

### Server Class

#### Constructor

```javascript
new Server(options);
```

**Options:**

- `ip` (string): IP address to bind to (default: '127.0.0.1')
- `port` (number): Port to listen on (default: 17091)
- `maxPeer` (number): Maximum number of peers (default: 32)
- `channelLimit` (number): Number of channels (default: 2)
- `usingNewPacketForServer` (boolean): Enable new packet format (default: false)
- `incomingBandwidth` (number): Incoming bandwidth limit (default: 0)
- `outgoingBandwidth` (number): Outgoing bandwidth limit (default: 0)

#### Methods

- `listen()` - Start the server event loop
- `stop()` - Stop the server
- `send(peerId, channelId, data, reliable = true)` - Send data to a peer
- `disconnect(peerId, data = 0)` - Disconnect a peer
- `on(event, callback)` - Add event listener (chainable)

### Client Class

#### Constructor

```javascript
new Client(options);
```

**Options:**

- `ip` (string): Server IP address (default: '127.0.0.1')
- `port` (number): Server port (default: 17091)
- `channelLimit` (number): Number of channels (default: 2)
- `usingNewPacket` (boolean): Enable new packet format (default: false)
- `incomingBandwidth` (number): Incoming bandwidth limit (default: 0)
- `outgoingBandwidth` (number): Outgoing bandwidth limit (default: 0)

#### Methods

- `listen()` - Connect to server and start event loop
- `stop()` - Stop the client
- `sendToServer(channelId, data, reliable = true)` - Send data to server
- `disconnectFromServer(data = 0)` - Disconnect from server
- `on(event, callback)` - Add event listener (chainable)

### Events

Both Client and Server support these events:

- `connect` - Fired when a peer connects
- `disconnect` - Fired when a peer disconnects
- `receive` - Fired when data is received
- `error` - Fired when an error occurs

### Features

- **Automatic Setup**: CRC32 checksums and range coder compression enabled by default
- **New Packet Support**: Optional support for ENet's new packet format
- **Error Handling**: Comprehensive error handling with error events
- **Peer Management**: Automatic peer cleanup on disconnect
- **Method Chaining**: Event handlers can be chained for cleaner code
- `destroy()` - Destroy the host

#### Events

- `connect` - Fired when a peer connects
- `disconnect` - Fired when a peer disconnects
- `receive` - Fired when data is received
- `error` - Fired when an error occurs

### Features

- **Automatic Setup**: CRC32 checksums and range coder compression enabled by default
- **New Packet Support**: Optional support for ENet's new packet format
- **Error Handling**: Comprehensive error handling with error events
- **Peer Management**: Automatic peer cleanup on disconnect
- **Method Chaining**: Event handlers can be chained for cleaner code

## Development

This project uses node-gyp to build the native addon. The ENet library source is included in the `enet/` directory.

### Building

```bash
npm run build
```

### Cleaning

```bash
npm run clean
```

## Architecture

- **Native Layer**: C++ bindings in `src/enet_addon.cpp`
- **JavaScript Layer**: High-level API in `index.js`
- **ENet Library**: Included C source in `enet/` directory
- **Build System**: node-gyp configuration in `binding.gyp`

## Troubleshooting

If you encounter build issues:

1. Make sure you have the required build tools:

   ```bash
   # On Ubuntu/Debian
   sudo apt-get install build-essential python3-dev

   # On macOS
   xcode-select --install
   ```

2. Clean and rebuild:
   ```bash
   npm run clean
   npm run build
   ```

## License

This project includes the ENet library, which is licensed under the MIT license. See the `enet/LICENSE` file for details.
