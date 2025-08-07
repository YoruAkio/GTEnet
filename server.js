import { Server } from './index.js';

// Create a server with configuration
const server = new Server({
  address: '127.0.0.1',
  port: 17091,
  maxPeer: 32,
  channelLimit: 2,
  usingNewPacketForServer: false,
  incomingBandwidth: 0,
  outgoingBandwidth: 0,
});

// Set up event handlers with chaining
server
  .on('connect', event => {
    console.log(`Client connected: ${event.peer}`);
  })
  .on('disconnect', event => {
    console.log(`Client disconnected: ${event.peer}, reason: ${event.data}`);
  })
  .on('receive', event => {
    console.log(
      `Received data from ${event.peer} on channel ${event.channelID}:`,
      event.data.toString(),
    );

    // Echo the message back
    server.send(event.peer, event.channelID, `Echo: ${event.data.toString()}`);
  })
  .on('error', err => {
    console.error('Server error:', err.message);
  });

console.log(`Server starting on ${server.config.ip}:${server.config.port}...`);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.stop();
  server.destroy();
  server.deinitialize();
  process.exit(0);
});

// Start listening
server.listen().catch(console.error);
