import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/env.js';
import buildCorsOptions from './config/cors.js';
import applySecurity from './config/security.js';
import { pool, ensureDbReady } from './config/db.js';
import { userRouter } from './routers/appRouter.js';
import { hostRoute } from './routers/hostRouter.js';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security and common middleware
applySecurity(app);
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static (e.g., uploads if used by host routes)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Friendy API is running!',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/auth/*',
      api: '/api/*',
      health: '/health'
    }
  });
});

// Health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Friendy Unified API is running',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Routers (mounted with explicit namespaces)
try {
  app.use('/api/user', userRouter); // e.g., /user/auth/signup
} catch (e) {
  console.warn('appRouter not found yet:', e.message);
}

try {
  app.use('/api/host', hostRoute);
} catch (e) {
  console.warn('hostRouter not loaded:', e.message);
}

try {
  const { default: adminRouter } = await import('./routers/adminRouter.js');
  app.use('/api/admin', adminRouter); // e.g., /admin/dashboard
} catch (e) {
  console.warn('adminRouter not loaded:', e.message);
}

try {
  const { default: agoraRouter } = await import('./routers/agoraRouter.js');
  app.use('/api/agora', agoraRouter); // e.g., /agora/generate-token
} catch (e) {
  console.warn('agoraRouter not loaded:', e.message);
}

// Global 404 handler (after all routes)
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);

// Socket.IO with permissive CORS for dev; tighten in prod via env
const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 20000,
  pingTimeout: 30000,
  transports: ['websocket', 'polling'],
});

// JWT auth for all namespaces
io.use((socket, next) => {
  try {
    const token = socket.handshake?.auth?.token || socket.handshake?.headers?.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('unauthorized'));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    try {
      const preview = typeof token === 'string' ? token.slice(0, 12) + '...' : '[non-string]';
      console.log('[socket][auth] token received', { preview });
      console.log('[socket][auth] payload keys', { keys: Object.keys(payload || {}) });
    } catch {}
    const derivedId =
      payload?.id ??
      payload?.user?.id ??
      payload?.userId ??
      payload?.user?.userId ??
      payload?.host?.id ??
      payload?.hostId ??
      payload?.host?.hostId ??
      payload?.data?.id ??
      payload?.sub ??
      null;
    socket.user = { id: derivedId, ...payload };
    if (!derivedId) {
      console.warn('[socket] JWT payload missing id field');
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

// Chat namespace
const chatNS = io.of('/chat');
chatNS.on('connection', (socket) => {
  try {
    if (socket.user?.id) socket.join(`user:${socket.user.id}`);
  } catch {}
  socket.on('register', ({ userId }) => {
    try {
      if (userId) {
        socket.user = { ...(socket.user || {}), id: userId };
        socket.join(`user:${userId}`);
        console.log('[chatNS] registered', { sid: socket.id, userId });
      }
    } catch {}
  });
  // join conversation room
  socket.on('join:conversation', ({ conversationId }) => {
    if (conversationId) {
      socket.join(`conversation:${conversationId}`);
    }
  });

  // basic message relay stub; persistence happens via REST
  socket.on('message:send', (msg) => {
    try {
      const room = `conversation:${msg?.conversationId}`;
      if (room) {
        chatNS.to(room).emit('message:new', { ...msg, serverTs: Date.now(), senderId: socket.user?.id });
      }
    } catch {}
  });

  socket.on('typing:start', ({ conversationId }) => {
    const room = `conversation:${conversationId}`;
    chatNS.to(room).emit('user:typing', { conversationId, userId: socket.user?.id, typing: true });
  });

  socket.on('typing:stop', ({ conversationId }) => {
    const room = `conversation:${conversationId}`;
    chatNS.to(room).emit('user:typing', { conversationId, userId: socket.user?.id, typing: false });
  });
});

// Call namespace (signaling only; RTC handled by Agora SDK)
const callNS = io.of('/call');
callNS.on('connection', (socket) => {
  try {
    console.log('[callNS] client connected', { sid: socket.id, userId: socket.user?.id });
    if (socket.user?.id) socket.join(`user:${socket.user.id}`);
  } catch {}
  socket.on('register', ({ userId }) => {
    try {
      if (userId) {
        socket.user = { ...(socket.user || {}), id: userId };
        socket.join(`user:${userId}`);
        console.log('[callNS] registered', { sid: socket.id, userId });
      }
    } catch {}
  });
  socket.on('call:ring', ({ callId, channelName, calleeId, mode }) => {
    console.log('[callNS] ring', { from: socket.user?.id, to: calleeId, callId, channelName, mode });
    if (calleeId) {
      try {
        const room = `user:${calleeId}`;
        const roomSize = callNS.adapter.rooms.get(room)?.size || 0;
        console.log('[callNS] emit incoming -> room', { room, roomSize });
      } catch {}
      callNS.to(`user:${calleeId}`).emit('call:incoming', { callId, channelName, callerId: socket.user?.id, calleeId, mode, ts: Date.now() });
      // temp: also notify caller so both sides log visibility during debug
      if (socket.user?.id) {
        callNS.to(`user:${socket.user.id}`).emit('call:incoming', { callId, channelName, callerId: socket.user?.id, calleeId, mode, ts: Date.now(), debugEcho: true });
      }
    } else {
      callNS.emit('call:incoming', { callId, channelName, callerId: socket.user?.id, calleeId, mode, ts: Date.now() });
    }
  });

  socket.on('call:accept', (payload) => {
    console.log('[callNS] accept', { by: socket.user?.id, payload });
    callNS.emit('call:accepted', { ...payload, ts: Date.now() });
  });

  socket.on('call:reject', (payload) => {
    console.log('[callNS] reject', { by: socket.user?.id, payload });
    callNS.emit('call:rejected', { ...payload, ts: Date.now() });
  });

  socket.on('call:cancel', (payload) => {
    console.log('[callNS] cancel', { by: socket.user?.id, payload });
    callNS.emit('call:canceled', { ...payload, ts: Date.now() });
  });

  socket.on('call:end', (payload) => {
    console.log('[callNS] end', { by: socket.user?.id, payload });
    callNS.emit('call:ended', { ...payload, ts: Date.now() });
  });
});

// Start server
// Tune Node HTTP server timeouts to reduce unexpected disconnects
server.keepAliveTimeout = 65000; // default 5000 can be short for mobile
server.headersTimeout = 66000;

const port = config.PORT;
(async () => {
  await ensureDbReady();
  server.listen(port, () => {
    console.log('🚀 Friendy Working API server running ' + port);
    console.log('📡 Socket.IO namespaces: /chat, /call');
    console.log('📱 Ready for connections!');
    console.log('✅ Server ready!');
  });
})();

// Graceful shutdown
const shutdown = async () => {
  try {
    console.log('\n🛑 Shutting down...');
    await new Promise((res) => server.close(() => res()));
    await pool.end();
    console.log('✅ Shutdown complete');
    process.exit(0);
  } catch (e) {
    console.error('Shutdown error', e);
    process.exit(1);
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app, pool };
