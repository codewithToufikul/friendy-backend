import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/env.js';
import buildCorsOptions from './config/cors.js';
import applySecurity from './config/security.js';
import { pool } from './config/db.js';
import { userRouter } from './routers/appRouter.js';
import { hostRoute } from './routers/hostRouter.js';

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
  app.use('api/admin', adminRouter); // e.g., /admin/dashboard
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

// Start server
const port = config.PORT;
  app.listen(port, () => {
    console.log('🚀 Friendy Working API server running ' + port);
    console.log('📱 Ready for connections!');
    console.log('✅ Server ready!');
  });

export { app, pool };
