import { Server, Client } from '../index.js';
import os from 'os';

// @note configuration via env or defaults
const TEST_DURATION_MS = parseInt(process.env.TEST_DURATION_MS || '15000', 10);
const PAYLOAD_SIZE = parseInt(process.env.PAYLOAD_SIZE || '65536', 10); // 64 KiB
const BURST = parseInt(process.env.BURST || '64', 10); // packets per event tick
const CHANNEL = parseInt(process.env.CHANNEL || '0', 10);
const RELIABLE = process.env.RELIABLE !== '0';

// @note helpers
const toMB = bytes => (bytes / (1024 * 1024));
const getSize = data => {
  if (typeof data === 'string') return Buffer.byteLength(data);
  if (Buffer.isBuffer(data)) return data.length;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (data instanceof ArrayBuffer) return data.byteLength;
  return 0;
};

// @note pretty print a boxed summary
function printBoxedSummary(title, pairs) {
  const labels = pairs.map(([k]) => String(k));
  const values = pairs.map(([, v]) => String(v));
  const labelWidth = Math.max(...labels.map(s => s.length));
  const valueWidth = Math.max(...values.map(s => s.length));
  const innerWidth = Math.max(title.length, labelWidth + 3 + valueWidth);
  const top = '┌' + '─'.repeat(innerWidth + 2) + '┐';
  const sep = '├' + '─'.repeat(innerWidth + 2) + '┤';
  const bot = '└' + '─'.repeat(innerWidth + 2) + '┘';
  console.log(top);
  console.log('│ ' + title.padEnd(innerWidth) + ' │');
  console.log(sep);
  for (let i = 0; i < pairs.length; i += 1) {
    const [k, v] = pairs[i];
    console.log('│ ' + String(k).padEnd(labelWidth) + ' : ' + String(v).padEnd(valueWidth) + ' │');
  }
  console.log(bot);
}

// @note prebuild high payload buffer once
const payload = Buffer.allocUnsafe(PAYLOAD_SIZE).fill(0x61);

const stats = {
  sent: 0,
  received: 0,
  sendErrors: 0,
  bytesSent: 0,
  bytesReceived: 0,
};

let running = false;
let endTimer = null;

// @note capture baseline metrics
const cpuStart = process.cpuUsage();
const memStart = process.memoryUsage();
const hrStart = process.hrtime.bigint();

const server = new Server({
  address: '127.0.0.1',
  port: 17091,
  usingNewPacketForServer: true,
  maxPeer: 12,
});

server
  .once('ready', () => {
    console.log('[server] ready');
  })
  .on('receive', evt => {
    // @note echo back
    server.send(evt.peer, evt.channelID, evt.data, RELIABLE);
  })
  .on('error', err => {
    console.error('[server] error', err);
  });

server.listen();

const client = new Client({
  address: '127.0.0.1',
  port: 17091,
  usingNewPacket: true,
});

client
  .on('connect', () => {
    console.log(`[client] connected, starting spam for ${TEST_DURATION_MS}ms | payload=${PAYLOAD_SIZE}B burst=${BURST} reliable=${RELIABLE}`);
    running = true;

    // @note schedule termination
    endTimer = setTimeout(finish, TEST_DURATION_MS);

    // @note start spam loop
    setImmediate(pumpSend);
  })
  .on('receive', evt => {
    stats.received += 1;
    stats.bytesReceived += getSize(evt.data);
  })
  .on('disconnect', evt => {
    console.log('[client] disconnect', evt);
  })
  .on('error', err => {
    console.error('[client] error', err);
  });

function pumpSend() {
  if (!running) return;
  for (let i = 0; i < BURST; i += 1) {
    const rc = client.send(CHANNEL, payload, RELIABLE);
    if (rc >= 0) {
      stats.sent += 1;
      stats.bytesSent += payload.length;
    } else {
      stats.sendErrors += 1;
    }
  }
  // @note give the event loop some air
  setImmediate(pumpSend);
}

async function finish() {
  if (!running) return;
  running = false;

  // @note wait a short moment for in-flight echoes
  await new Promise(r => setTimeout(r, 250));

  client.flush?.();
  server.flush?.();

  // @note compute metrics
  const hrEnd = process.hrtime.bigint();
  const elapsedMs = Number(hrEnd - hrStart) / 1e6;
  const cpu = process.cpuUsage(cpuStart);
  const memEnd = process.memoryUsage();

  const userMs = cpu.user / 1000;
  const sysMs = cpu.system / 1000;
  const cpuPctSingleCore = ((userMs + sysMs) / elapsedMs) * 100;

  const rssNowMB = toMB(memEnd.rss);
  const rssDeltaMB = toMB(memEnd.rss - memStart.rss);

  const sentPerSec = stats.sent / (elapsedMs / 1000);
  const recvPerSec = stats.received / (elapsedMs / 1000);
  const mbSent = toMB(stats.bytesSent);
  const mbRecv = toMB(stats.bytesReceived);
  const mbpsOut = mbSent / (elapsedMs / 1000);
  const mbpsIn = mbRecv / (elapsedMs / 1000);

  // @note boxed summary
  printBoxedSummary('gtenet stress summary', [
    ['duration', `${elapsedMs.toFixed(2)} ms`],
    ['payload', `${PAYLOAD_SIZE} B`],
    ['burst', `${BURST} pkt/tick`],
    ['reliable', String(RELIABLE)],
    ['cores', `${os.cpus().length}`],
    ['cpu user', `${userMs.toFixed(2)} ms`],
    ['cpu sys', `${sysMs.toFixed(2)} ms`],
    ['cpu usage', `${cpuPctSingleCore.toFixed(2)} % of 1 core`],
    ['rss now', `${rssNowMB.toFixed(2)} MB`],
    ['rss delta', `${rssDeltaMB.toFixed(2)} MB`],
    ['sent', `${stats.sent} pkts`],
    ['recv', `${stats.received} pkts`],
    ['send errors', `${stats.sendErrors}`],
    ['bytes out', `${mbSent.toFixed(2)} MB`],
    ['bytes in', `${mbRecv.toFixed(2)} MB`],
    ['pps out', `${sentPerSec.toFixed(2)} pps`],
    ['pps in', `${recvPerSec.toFixed(2)} pps`],
    ['throughput out', `${mbpsOut.toFixed(2)} MB/s`],
    ['throughput in', `${mbpsIn.toFixed(2)} MB/s`],
  ]);

  // @note cleanup
  try { client.disconnect(); } catch {}
  try { client.stop(); } catch {}
  try { client.destroy(); } catch {}
  try { server.stop(); } catch {}
  try { server.destroy(); } catch {}

  setTimeout(() => process.exit(0), 200);
}

// @note kick off connection (starts client service loop in background on timeout mode)
client.connect({ timeoutMs: 2000 }).catch(err => {
  console.error('[client] connect failed', err);
  finish();
});