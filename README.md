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

## API Reference

### ENetHost

#### Methods

- `initialize()` - Initialize the ENet library
- `deinitialize()` - Clean up ENet resources
- `createServer(address, port, options)` - Create a server host
- `createClient(options)` - Create a client host
- `connect(address, port, channelCount, data)` - Connect to a server
- `disconnect(peerId, data)` - Disconnect a peer
- `send(peerId, channelId, data, reliable)` - Send data to a peer
- `service(timeout)` - Process network events
- `startEventLoop(interval)` - Start automatic event processing
- `stopEventLoop()` - Stop the event loop
- `destroy()` - Destroy the host

#### Events

- `connect` - Fired when a peer connects
- `disconnect` - Fired when a peer disconnects
- `receive` - Fired when data is received

## Basic Usage Example

```javascript
import ENetHost from './index.js';

// Create and initialize a host
const host = new ENetHost();
host.initialize();

// For server
host.createServer('127.0.0.1', 7777);

// For client
host.createClient();

// Set up event handlers
host.on('connect', event => {
  console.log('Peer connected:', event.peer);
});

host.on('receive', event => {
  console.log('Received:', event.data.toString());
});

// Start processing events
host.startEventLoop();

// Clean up when done
host.destroy();
host.deinitialize();
```

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
