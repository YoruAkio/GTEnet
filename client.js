import ENetHost from './index.js';
import { createInterface } from 'readline';

// Create a client
const client = new ENetHost();
let serverPeer = null;

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function startClient() {
  console.log('Initializing ENet...');
  client.initialize();

  console.log('Creating client...');
  client.createClient();

  // Set up event handlers
  client.on('connect', event => {
    console.log(`Connected to server!`);
    serverPeer = event.peer;

    // Start accepting user input
    promptForMessage();
  });

  client.on('disconnect', event => {
    console.log(`Disconnected from server, reason: ${event.data}`);
    serverPeer = null;
  });

  client.on('receive', event => {
    console.log(`Server says: ${event.data.toString()}`);
    promptForMessage();
  });

  console.log('Connecting to server at localhost:7777...');
  client.connect('45.77.168.68', 17091);

  // Start the event loop
  client.startEventLoop();
}

function promptForMessage() {
  if (serverPeer) {
    rl.question('Enter message (or "quit" to exit): ', input => {
      if (input.toLowerCase() === 'quit') {
        client.disconnect(serverPeer);
        setTimeout(() => {
          client.stopEventLoop();
          client.destroy();
          client.deinitialize();
          process.exit(0);
        }, 100);
      } else if (input.trim()) {
        client.send(serverPeer, 0, input);
      } else {
        promptForMessage();
      }
    });
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down client...');
  if (serverPeer) {
    client.disconnect(serverPeer);
  }
  client.stopEventLoop();
  client.destroy();
  client.deinitialize();
  rl.close();
  process.exit(0);
});

startClient().catch(console.error);
