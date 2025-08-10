# 🌐 GTEnet

A high-performance Node.js binding for the ENet reliable UDP networking library. Built specifically for Growtopia private server development with modern JavaScript APIs. 🚀

> [!WARNING]
> This project is in early development. Expect breaking changes and limited features. Use at your own risk!
> Tested on:
> - Linux ( Arch Linux )
> - Windows ( Soon )
> - MacOS ( Soon )

## 📋 Requirements

```bash
# Node.js 18.x
# Python 3.1x
```

## 📦 Installation

```bash
npm install gtenet
```

or with Bun:

```bash
bun add gtenet

# you might get message blocked postinstall, you can run it manually
bun pm trust gtenet
```

## 🚀 Quick Start

### Running the Examples

Start a server:

```bash
node run example/server

# or

bun run example/server
```

In another terminal, start a client:

```bash
node run example/client

# or

bun run example/client
```

## 📖 Basic Usage

### 🖥️ Server Example

```javascript
import { Server } from 'gtenet';

// Create a server with automatic port checking
const server = await Server.create({
  ip: '127.0.0.1', // Server IP address
  port: 17091, // Server port
  maxPeer: 32, // Maximum connected clients
});

// Set up event handlers with chaining
server
  .on('connect', event => {
    console.log('🎉 Client connected:', event.peer);
  })
  .on('disconnect', event => {
    console.log('👋 Client disconnected:', event.peer);
  })
  .on('receive', event => {
    console.log('📨 Received:', event.data.toString());
    // Echo the message back
    server.send(event.peer, 0, `Echo: ${event.data.toString()}`);
  })
  .on('error', err => {
    console.error('❌ Server error:', err.message);
  });

// Start listening for connections
await server.listen();
```

### 💻 Client Example

```javascript
import { Client } from 'gtenet';

// Create a client
const client = new Client({
  ip: '127.0.0.1', // Server IP
  port: 17091, // Server port
});

// Set up event handlers
client
  .on('connect', event => {
    console.log('🔗 Connected to server!');
    client.sendToServer(0, 'Hello Server! 👋');
  })
  .on('disconnect', event => {
    console.log('💔 Disconnected from server');
  })
  .on('receive', event => {
    console.log('📩 Server says:', event.data.toString());
  })
  .on('error', err => {
    console.error('❌ Client error:', err.message);
  });

// Connect and start listening
await client.listen();
```

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for more information.

## 🙏 Acknowledgements

- 🌐 [ENet](https://github.com/eikarna/enet) - ENet reliable UDP networking library
- ⚙️ [Node-Addon-API](https://github.com/nodejs/node-addon-api) - Node.js addon API for native modules
- 🌱 [growtopia.js](https://github.com/StileDevs/growtopia.js) - High-performance Growtopia private server framework

## 📢 Special Thanks

Thanks to these people

 - [@lsalzman](https://github.com/lsalzman)
 - [@ZtzTopia](https://github.com/ZtzTopia)
 - [@eikarna](https://github.com/eikarna)
 - [@StileDevs](https://github.com/StileDevs)
 - [@JadlionHD](https://github.com/JadlionHD)
