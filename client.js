import { Client } from './index.js';
import { createInterface } from 'readline';

// Create a client with configuration
const client = new Client({
  ip: '127.0.0.1',
  port: 17091,
  channelLimit: 2,
  usingNewPacket: false,
  incomingBandwidth: 0,
  outgoingBandwidth: 0,
});

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Set up event handlers with chaining
client
  .on('connect', event => {
    console.log('Connected to server!');

    // Start accepting user input
    promptForMessage();
  })
  .on('disconnect', event => {
    console.log(`Disconnected from server, reason: ${event.data}`);
  })
  .on('receive', event => {
    console.log(`Server says: ${event.data.toString()}`);
    promptForMessage();
  })
  .on('error', err => {
    console.error('Client error:', err.message);
  });

console.log('Connecting to server at 127.0.0.1:17091...');

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down client...');
  client.disconnectFromServer();
  client.stop();
  client.destroy();
  client.deinitialize();
  rl.close();
  process.exit(0);
});

// Start listening (this will connect and begin event loop)
client.listen().catch(console.error);
