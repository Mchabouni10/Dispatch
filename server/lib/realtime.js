// server/lib/realtime.js
//
// Thin wrapper around Socket.io so routes don't need to know how the
// server was wired up. Mirrors lib/prisma.js: one shared instance,
// required wherever it's needed.
//
// initRealtime(httpServer) is called once, from server.js, when the
// app boots. emit(event, payload) is safe to call from anywhere
// (routes, scripts, tests) even before initRealtime has run — it's a
// no-op until a socket server exists, so nothing breaks or throws if
// realtime isn't wired up in a given environment (e.g. tests).

const { Server } = require('socket.io');
const { verifyToken } = require('./auth');

let io = null;

// The client (DashboardView.jsx) connects and immediately does:
//   socket.emit('subscribe', { room: 'dashboard' })
// then listens for events on that room. Right now 'dashboard' is the
// only room in use, but keeping the join generic means new pages can
// subscribe to their own rooms later without changing this file.
function initRealtime(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: '*' },
  });

  // Previously any socket could connect with zero authentication and join
  // 'dashboard' to receive live driver/trip/shipment updates — including the
  // driver:upsert payload, which (see routes/drivers.js) carries HR fields
  // like pay rate, license number, and medical info. This middleware rejects
  // the connection outright unless the client presents the same Bearer token
  // it uses for REST calls, via `io(url, { auth: { token } })` on the client.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const tokenData = verifyToken(token);
    if (!tokenData) return next(new Error('Unauthorized'));
    socket.userId = tokenData.sub;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('subscribe', (payload) => {
      const room = payload?.room;
      if (typeof room === 'string' && room) socket.join(room);
    });
  });

  console.log('🔌 Realtime (Socket.io) server ready');
  return io;
}

// Broadcasts to everyone in the 'dashboard' room. Silently does
// nothing if initRealtime() hasn't run yet (e.g. this module is
// required by a route file during a unit test that never boots the
// full server) — callers never need to guard this themselves.
function emit(event, payload) {
  if (!io) return;
  io.to('dashboard').emit(event, payload);
}

module.exports = { initRealtime, emit };