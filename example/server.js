import { Server } from '../index.js';

const server = await Server.create({
  ip: '127.0.0.1',
  port: 17091,
  maxPeer: 32,
  usingNewPacketForServer: true,
});

server
  .on('ready', () => {
    console.log(
      `🚀 Server is ready and listening on ${server.config.ip}:${server.config.port}`,
    );
  })
  .on('connect', event => {
    console.log(`🎉 Client connected: ${event.peer}`);
    server.send(event.peer, 0, 'Welcome to the server!');
  })
  .on('disconnect', event => {
    console.log(`👋 Client disconnected: ${event.peer}, reason: ${event.data}`);
  })
  .on('receive', event => {
    console.log(`📨 Received from ${event.peer}: ${event.data.toString()}`);
    // Echo the message back
    server.send(event.peer, 0, `Echo: ${event.data.toString()}`);
  })
  .on('error', err => {
    console.error('❌ Server error:', err.message);
  });

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.stop();
  server.destroy();
  server.deinitialize();
  process.exit(0);
});

server.listen().catch(console.error);