import { Client } from '../index.js';

// Create a client with configuration
const client = new Client({
  ip: '127.0.0.1',
  port: 17091,
  usingNewPacket: true,
});

console.log(`🔌 Connecting to ${client.config.ip}:${client.config.port}...`);

// Set up event handlers with chaining
client
  .on('connect', event => {
    console.log(`✅ Connected to server! Peer ID: ${event.peer}`);

    // sending message to server
    client.sendToServer(0, 'Hello, world!');
  })
  .on('disconnect', event => {
    console.log(`👋 Disconnected from server, reason: ${event.data}`);
  })
  .on('receive', event => {
    console.log(`📨 Server says: ${event.data.toString()}`);
  })
  .on('error', err => {
    console.error('❌ Client error:', err.message);
  });

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down client...');
  client.disconnectFromServer();
  client.stop();
  client.destroy();
  client.deinitialize();
  process.exit(0);
});

// Start listening (this will connect and begin event loop)
client.listen().catch(console.error);
