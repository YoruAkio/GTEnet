// @note integration echo test
import { startEchoServer, startClient, shutdown } from './utils.js';

const port = 18001;
const server = await startEchoServer({ port });

const client = await startClient({ port });

let received = null;
let connected = false;

client
  .on('connect', evt => {
    connected = true;
    client.send(0, 'ping');
  })
  .on('receive', evt => {
    received = evt.data.toString();
    // end after first echo
    client.disconnect();
    client.stop();
  })
  .on('error', err => {
    console.error('test error:', err.message);
  });

await client.connect({ timeoutMs: 1000 });

// wait briefly to ensure receive processed
await new Promise(r => setTimeout(r, 50));

if (!connected) {
  await shutdown(server, client);
  throw new Error('client did not connect');
}
if (received !== 'ping') {
  await shutdown(server, client);
  throw new Error(`expected echo 'ping', got '${received}'`);
}

await shutdown(server, client);
console.log('OK integration-echo'); 