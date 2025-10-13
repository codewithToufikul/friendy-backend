const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:8080',
    'http://192.168.29.237:3000',
    'http://192.168.29.121:*',
    'https://friendy.app',
    'https://friendy-backend.vercel.app',
    'https://*.vercel.app'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// JWT Secret
const JWT_SECRET = 'friendy_host_app_secret_key_2024';

// In-memory storage for demo
const users = new Map();
const hosts = new Map();

// Helper function to generate user ID
const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

// Health check
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

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Friendy API is healthy!',
    database: 'In-Memory (Demo)',
    timestamp: new Date().toISOString()
  });
});

// User Registration
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name, age, gender } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Check if user already exists
    if (users.has(email)) {
      return res.status(400).json({
        success: false,
        error: 'User already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = generateId();
    const user = {
      id: userId,
      email,
      name: name || 'User',
      age: age || 18,
      gender: gender || 'male',
      createdAt: new Date().toISOString()
    };

    users.set(email, { ...user, password: hashedPassword });

    // Generate JWT token
    const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// User Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user
    const userData = users.get(email);
    if (!userData) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, userData.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: userData.id, email }, JWT_SECRET, { expiresIn: '7d' });

    // Remove password from response
    const { password: _, ...user } = userData;

    res.json({
      success: true,
      message: 'Login successful',
      user,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Host Registration
app.post('/auth/host/register', async (req, res) => {
  try {
    const { email, password, name, age, gender, city } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Check if host already exists
    if (hosts.has(email)) {
      return res.status(400).json({
        success: false,
        error: 'Host already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create host
    const hostId = generateId();
    const host = {
      id: hostId,
      email,
      name: name || 'Host',
      age: age || 21,
      gender: gender || 'female',
      city: city || 'Mumbai',
      isApproved: true,
      isOnline: false,
      isLive: false,
      createdAt: new Date().toISOString()
    };

    hosts.set(email, { ...host, password: hashedPassword });

    // Generate JWT token
    const token = jwt.sign({ hostId, email, role: 'host' }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'Host registered successfully',
      user: host,
      token
    });
  } catch (error) {
    console.error('Host registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Host Login
app.post('/auth/host/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find host
    const hostData = hosts.get(email);
    if (!hostData) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, hostData.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign({ hostId: hostData.id, email, role: 'host' }, JWT_SECRET, { expiresIn: '7d' });

    // Remove password from response
    const { password: _, ...host } = hostData;

    res.json({
      success: true,
      message: 'Host login successful',
      user: host,
      token
    });
  } catch (error) {
    console.error('Host login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// API Routes
app.get('/api/hosts', (req, res) => {
  const hostList = Array.from(hosts.values()).map(({ password, ...host }) => host);
  res.json({
    success: true,
    hosts: hostList
  });
});

app.get('/api/profile', (req, res) => {
  res.json({
    success: true,
    profile: {
      id: '1',
      name: 'Demo User',
      age: 25,
      gender: 'male',
      city: 'Mumbai',
      bio: 'Welcome to Friendy!',
      images: []
    }
  });
});

// Start server (only in non-serverless environment)
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log('🚀 Friendy Working API server running on http://localhost:' + port);
    console.log('📱 Ready for Flutter app connections!');
    console.log('🔗 Test endpoint: http://localhost:' + port + '/health');
    console.log('');
    console.log('Available endpoints:');
    console.log('  POST /auth/register - User registration');
    console.log('  POST /auth/login - User login');
    console.log('  POST /auth/host/register - Host registration');
    console.log('  POST /auth/host/login - Host login');
    console.log('  GET /api/hosts - Get all hosts');
    console.log('  GET /api/profile - Get user profile');
    console.log('  GET /health - Health check');
    console.log('');
    console.log('✅ Server ready for Flutter app!');
  });
}

// Export for Vercel serverless functions
module.exports = app;
