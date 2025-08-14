// @note performance echo test (single client)
import { startEchoServer, startClient, shutdown } from './utils.js';

const randomPort = 20000 + Math.floor(Math.random() * 20000);
const port = parseInt(process.env.GTENET_TEST_PORT || String(randomPort), 10);
const count = parseInt(process.env.GTENET_TEST_COUNT || '1000', 10);

const server = await startEchoServer({ port });
const client = await startClient({ port });

let received = 0;
let connected = false;

client
  .on('connect', () => {
    connected = true;
  })
  .on('receive', () => {
    received++;
    if (received === count) {
      client.disconnect();
      client.stop();
    }
  })
  .on('error', err => {
    console.error('perf error:', err.message);
  });

await client.connect({ timeoutMs: 1000 });

if (!connected) {
  await shutdown(server, client);
  throw new Error('client failed to connect');
}

const start = Date.now();
for (let i = 0; i < count; i++) {
  client.send(0, 'x');
}
client.flush();

while (received < count) {
  await new Promise(r => setTimeout(r, 1));
}
const ms = Date.now() - start;

await shutdown(server, client);
console.log(`OK perf-echo ${count} msgs in ${ms}ms`); 