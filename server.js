import ENetHost from './index.js';

// Create a server
const server = new ENetHost();

async function startServer() {
  console.log('Initializing ENet...');
  server.initialize();

  console.log('Creating server on localhost:7777...');
  server.createServer('127.0.0.1', 7777);

  // Set up event handlers
  server.on('connect', event => {
    console.log(`Client connected: ${event.peer}`);
  });

  server.on('disconnect', event => {
    console.log(`Client disconnected: ${event.peer}, reason: ${event.data}`);
  });

  server.on('receive', event => {
    console.log(
      `Received data from ${event.peer} on channel ${event.channelID}:`,
      event.data.toString(),
    );

    // Echo the message back
    server.send(event.peer, event.channelID, `Echo: ${event.data.toString()}`);
  });

  console.log('Server started! Waiting for connections...');

  // Start the event loop
  server.startEventLoop();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.stopEventLoop();
  server.destroy();
  server.deinitialize();
  process.exit(0);
});

startServer().catch(console.error);
