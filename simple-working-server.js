const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();
// Agora token builder
let RtcTokenBuilder, RtcRole;
try {
  ({ RtcTokenBuilder, RtcRole } = require('agora-access-token'));
} catch (e) {
  console.warn('⚠️ agora-access-token not installed yet. Run: npm install agora-access-token');
}

// Agora configuration (read from .env; fallback to existing values for dev)
const AGORA_APP_ID = process.env.AGORA_APP_ID || 'f8e43d23a7b24139888bb80bc96e50e5';
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || '90d62b38ae5044b58a1c78732f2239f7';

const app = express();
const port = process.env.PORT || 3000;

// Simple CORS configuration - Allow all origins for admin panel
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Additional CORS headers for admin panel
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Alias: some clients call POST /reject
app.post('/api/call-requests/:requestId/reject', async (req, res) => {
  // Delegate to PUT handler logic
  req.method = 'PUT';
  return app._router.handle(req, res, () => {});
});

// Update call request status (generic)
app.put('/api/call-requests/:requestId/status', async (req, res) => {
  try {
    const { requestId } = req.params;
    // Accept status either from body or query for lenient clients
    const statusFromBody = (req.body || {}).status;
    const statusFromQuery = req.query?.status;
    const status = statusFromBody || statusFromQuery;
    const channel_name = (req.body || {}).channel_name || req.query?.channel_name;
    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }

    const allowed = ['pending', 'accepted', 'rejected', 'expired'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of ${allowed.join(', ')}` });
    }

    const updates = ['status = $1'];
    const values = [status, requestId];
    if (channel_name) {
      updates.push('channel_name = $3');
      values.splice(1, 0, channel_name); // insert channel_name as $2
    }

    const query = `UPDATE call_requests SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Call request not found' });
    }

    return res.json({ success: true, request: result.rows[0] });
  } catch (error) {
    console.error('❌ Update call request status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// Alias: POST /api/agora/token (some clients use this path)
app.post('/api/agora/token', async (req, res) => {
  try {
    if (!RtcTokenBuilder || !RtcRole) {
      return res.status(500).json({ success: false, message: 'agora-access-token not installed on server' });
    }

    // Accept either channelName or channel
    const channelName = req.body?.channelName || req.body?.channel || req.body?.channel_name;
    const uid = req.body?.uid;
    const role = req.body?.role || 'publisher';

    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      return res.status(500).json({ success: false, message: 'Agora App ID or Certificate not configured' });
    }
    if (!channelName || typeof channelName !== 'string') {
      return res.status(400).json({ success: false, message: 'channelName (string) is required' });
    }
    if (uid === undefined || uid === null || isNaN(Number(uid))) {
      return res.status(400).json({ success: false, message: 'uid (number) is required' });
    }
    if (!['publisher', 'subscriber'].includes(role)) {
      return res.status(400).json({ success: false, message: "role must be 'publisher' or 'subscriber'" });
    }

    const agoraRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const expireSeconds = 24 * 60 * 60;
    const currentTs = Math.floor(Date.now() / 1000);
    const privilegeExpireTs = currentTs + expireSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      Number(uid),
      agoraRole,
      privilegeExpireTs
    );

    return res.json({ success: true, token, appId: AGORA_APP_ID, expiresIn: expireSeconds });
  } catch (error) {
    console.error('❌ Agora token generation error (alias):', error);
    return res.status(500).json({ success: false, message: 'Failed to generate token', error: error.message });
  }
});

// Alias: GET /api/agora/generate-token?channelName=...&uid=0&role=publisher
app.get('/api/agora/generate-token', async (req, res) => {
  try {
    if (!RtcTokenBuilder || !RtcRole) {
      return res.status(500).json({ success: false, message: 'agora-access-token not installed on server' });
    }

    const channelName = req.query?.channelName || req.query?.channel || req.query?.channel_name;
    const uid = req.query?.uid;
    const role = req.query?.role || 'publisher';

    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      return res.status(500).json({ success: false, message: 'Agora App ID or Certificate not configured' });
    }
    if (!channelName || typeof channelName !== 'string') {
      return res.status(400).json({ success: false, message: 'channelName (string) is required' });
    }
    if (uid === undefined || uid === null || isNaN(Number(uid))) {
      return res.status(400).json({ success: false, message: 'uid (number) is required' });
    }
    if (!['publisher', 'subscriber'].includes(role)) {
      return res.status(400).json({ success: false, message: "role must be 'publisher' or 'subscriber'" });
    }

    const agoraRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const expireSeconds = 24 * 60 * 60;
    const currentTs = Math.floor(Date.now() / 1000);
    const privilegeExpireTs = currentTs + expireSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      Number(uid),
      agoraRole,
      privilegeExpireTs
    );

    return res.json({ success: true, token, appId: AGORA_APP_ID, expiresIn: expireSeconds });
  } catch (error) {
    console.error('❌ Agora token generation error (GET):', error);
    return res.status(500).json({ success: false, message: 'Failed to generate token', error: error.message });
  }
});
// Parse JSON bodies BEFORE defining any endpoints that read req.body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== AGORA TOKEN ENDPOINT ====================
app.post('/api/agora/generate-token', async (req, res) => {
  try {
    if (!RtcTokenBuilder || !RtcRole) {
      return res.status(500).json({ success: false, message: 'agora-access-token not installed on server' });
    }

    const { channelName, uid, role } = req.body || {};

    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      return res.status(500).json({ success: false, message: 'Agora App ID or Certificate not configured' });
    }
    if (!channelName || typeof channelName !== 'string') {
      return res.status(400).json({ success: false, message: 'channelName (string) is required' });
    }
    if (uid === undefined || uid === null || isNaN(Number(uid))) {
      return res.status(400).json({ success: false, message: 'uid (number) is required' });
    }
    if (!['publisher', 'subscriber'].includes(role)) {
      return res.status(400).json({ success: false, message: "role must be 'publisher' or 'subscriber'" });
    }

    const agoraRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    const expireSeconds = 24 * 60 * 60; // 24 hours
    const currentTs = Math.floor(Date.now() / 1000);
    const privilegeExpireTs = currentTs + expireSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      Number(uid),
      agoraRole,
      privilegeExpireTs
    );

    return res.json({ success: true, token, appId: AGORA_APP_ID, expiresIn: expireSeconds });
  } catch (error) {
    console.error('❌ Agora token generation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate token', error: error.message });
  }
});


// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'friendy_host_app_secret_key_2024';

// Database connection
console.log('🔧 Environment check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.stack);
    console.error('❌ Connection string exists:', !!process.env.DATABASE_URL);
  } else {
    console.log('✅ Database connected successfully');
    console.log('✅ Connection string length:', process.env.DATABASE_URL?.length || 0);
    release();
  }
});

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        age INTEGER,
        gender VARCHAR(10),
        city VARCHAR(100),
        bio TEXT,
        profile_image TEXT,
        is_verified BOOLEAN DEFAULT false,
        user_type VARCHAR(20) DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create hosts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hosts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        age INTEGER,
        gender VARCHAR(10),
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100),
        bio TEXT,
        languages TEXT[],
        profile_image TEXT,
        is_verified BOOLEAN DEFAULT false,
        is_online BOOLEAN DEFAULT false,
        rating DECIMAL(3,2) DEFAULT 0.00,
        total_earnings DECIMAL(10,2) DEFAULT 0.00,
        bank_account_number VARCHAR(50),
        bank_ifsc VARCHAR(20),
        bank_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create users table for customer app
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        phone VARCHAR(20),
        age INTEGER DEFAULT 18,
        gender VARCHAR(10) DEFAULT 'male',
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100),
        profile_image TEXT,
        device_id VARCHAR(255) UNIQUE,
        login_type VARCHAR(20) NOT NULL, -- 'quick', 'google', 'email'
        google_id VARCHAR(255) UNIQUE,
        is_quick_login_used BOOLEAN DEFAULT false,
        coins_balance INTEGER DEFAULT 0,
        is_online BOOLEAN DEFAULT false,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// Initialize database on startup
initializeDatabase();

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.json({ 
    status: 'ok', 
    message: 'Friendy Backend API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Friendy Backend API',
    status: 'running',
    endpoints: [
      'GET /health',
      'GET /admin/dashboard',
      'GET /admin/hosts',
      'GET /admin/host-requests',
      'POST /admin/approve-host/:id',
      'POST /admin/reject-host/:id',
      'DELETE /admin/delete-host/:id',
      'POST /auth/host/register',
      'POST /auth/host/login',
      'POST /auth/user/quick-login',
      'POST /auth/user/google-login',
      'POST /auth/user/email-login',
      'GET /auth/user/profile',
      'GET /users/:id',
      'POST /admin/reset-database',
      'POST /admin/create-users-table'
    ]
  });
});

// ==================== AUTH ENDPOINTS ====================

// Host registration
app.post('/auth/host/register', async (req, res) => {
  try {
    console.log('📝 Host registration request received');
    console.log('📝 Request body:', req.body);
    console.log('📝 Database pool status:', pool.totalCount, 'total connections');

    const { name, email, password, phone, age, gender, city, bio, state, country, languages } = req.body;

    // Validate required fields
    if (!name || !email || !password || !phone || !age || !gender || !city || !bio) {
      console.log('❌ Validation failed - missing fields');
      return res.status(400).json({
        success: false,
        message: 'All fields are required: name, email, password, phone, age, gender, city, bio'
      });
    }

    console.log('✅ Validation passed, hashing password...');
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('💾 Inserting into database...');
    // Insert host into users table
    const result = await pool.query(`
      INSERT INTO users (
        name, email, password_hash, phone, age, gender, city, state, country,
        role, host_bio, host_languages, is_host_approved, login_type, profile_completed, is_approved,
        video_call_rate, voice_call_rate, message_rate, host_rating
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 'host', $10, $11, false, 'email', true, true, 50.0, 30.0, 10.0, 4.5
      ) RETURNING id, name, email, is_host_approved
    `, [name, email, hashedPassword, phone, age, gender, city, state || 'Maharashtra', country || 'India', bio, languages || ['Hindi', 'English']]);

    console.log('✅ Database insert successful:', result.rows[0]);
    const host = result.rows[0];

    res.json({
      success: true,
      message: 'Host registration submitted for approval',
      host: {
        id: host.id,
        name: host.name,
        email: host.email,
        is_verified: host.is_host_approved
      }
    });
  } catch (error) {
    console.error('❌ Host registration error:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error code:', error.code);

    if (error.code === '23505') { // Unique violation
      res.status(400).json({ success: false, message: 'Email already registered' });
    } else {
      res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
    }
  }
});

// Host login
app.post('/auth/host/login', async (req, res) => {
  try {
    console.log('Host login request:', req.body);
    const { email, password } = req.body;

    // Find host in users table
    const result = await pool.query(`
      SELECT * FROM users
      WHERE email = $1 AND role = 'host'
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const host = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, host.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if approved
    if (!host.is_host_approved) {
      return res.status(403).json({
        success: false,
        message: 'Account pending approval',
        pending: true
      });
    }

    const token = jwt.sign({ id: host.id, email: host.email, type: 'host' }, JWT_SECRET);

    res.json({
      success: true,
      message: 'Login successful',
      host: {
        id: host.id,
        name: host.name,
        email: host.email,
        is_verified: host.is_host_approved,
        online_status: host.online_status,
        busy_status: host.busy_status,
        live_status: host.live_status,
        video_call_rate: host.video_call_rate,
        voice_call_rate: host.voice_call_rate
      },
      token: token
    });
  } catch (error) {
    console.error('Host login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Host status update
app.put('/api/hosts/:hostId/status', async (req, res) => {
  try {
    const { hostId } = req.params;
    const { online_status, busy_status, live_status } = req.body;

    console.log('🔄 Updating host status:', hostId, req.body);

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (online_status !== undefined) {
      updates.push(`online_status = $${paramCount}`);
      values.push(online_status);
      paramCount++;
    }

    if (busy_status !== undefined) {
      updates.push(`busy_status = $${paramCount}`);
      values.push(busy_status);
      paramCount++;
    }

    if (live_status !== undefined) {
      updates.push(`live_status = $${paramCount}`);
      values.push(live_status);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No status updates provided' });
    }

    values.push(hostId);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} AND role = 'host' RETURNING *`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Host not found' });
    }

    console.log('✅ Host status updated:', result.rows[0]);

    res.json({
      success: true,
      message: 'Status updated successfully',
      host: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Host status update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// Get call requests for host
app.get('/api/hosts/:hostId/call-requests', async (req, res) => {
  try {
    const { hostId } = req.params;
    if (process.env.DEBUG_CALLS === '1') {
      console.log('📞 Getting call requests for host:', hostId);
    }

    const result = await pool.query(`
      SELECT
        cr.*,
        COALESCE(u.name, CONCAT('Customer ', SUBSTRING(cr.customer_id, 1, 8))) as customer_name,
        u.email as customer_email
      FROM call_requests cr
      LEFT JOIN users u ON cr.customer_id::uuid = u.id
      WHERE cr.host_id = $1 AND cr.status = 'pending' AND cr.expires_at > CURRENT_TIMESTAMP
      ORDER BY cr.created_at ASC
    `, [hostId]);

    if (process.env.DEBUG_CALLS === '1') {
      console.log(`📞 Found ${result.rows.length} pending call requests for host ${hostId}`);
      console.log('📞 Call requests:', result.rows.map(r => ({ id: r.id, customer_id: r.customer_id, call_type: r.call_type })));
    }

    res.json({
      success: true,
      requests: result.rows,
      message: 'Call requests retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error getting call requests:', error);
    console.error('❌ Error details:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get call requests', error: error.message });
  }
});

// Debug endpoint to get all call requests
app.get('/api/debug/call-requests', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM call_requests ORDER BY created_at DESC');
    res.json({
      success: true,
      requests: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('❌ Error getting all call requests:', error);
    res.status(500).json({ success: false, message: 'Failed to get call requests' });
  }
});

// Fix host passwords endpoint
app.post('/admin/fix-host-passwords', async (req, res) => {
  try {
    console.log('🔧 Fixing host passwords...');

    // Hash the default password
    const defaultPassword = 'password123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Update all hosts with the hashed password
    const result = await pool.query(`
      UPDATE users
      SET password_hash = $1
      WHERE role = 'host' AND (password_hash IS NULL OR password_hash = 'password123')
      RETURNING id, name, email
    `, [hashedPassword]);

    console.log(`✅ Fixed passwords for ${result.rows.length} hosts`);

    res.json({
      success: true,
      message: `Fixed passwords for ${result.rows.length} hosts`,
      hosts: result.rows
    });
  } catch (error) {
    console.error('❌ Error fixing host passwords:', error);
    res.status(500).json({ success: false, message: 'Failed to fix host passwords' });
  }
});

// ==================== USER AUTH ENDPOINTS ====================

// Quick login for users (one-time per device)
app.post('/auth/user/quick-login', async (req, res) => {
  try {
    console.log('🚀 Quick login request:', req.body);
    const { deviceId, name, age, gender } = req.body;

    if (!deviceId || !name) {
      return res.status(400).json({ success: false, message: 'Device ID and name are required' });
    }

    // Check if device already used quick login
    const existingUser = await pool.query('SELECT * FROM users WHERE device_id = $1', [deviceId]);

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];

      // Update last login
      await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

      // Generate JWT token
      const token = jwt.sign({ userId: user.id, loginType: 'quick' }, process.env.JWT_SECRET || 'friendy_secret', { expiresIn: '30d' });

      return res.json({
        success: true,
        message: 'Quick login successful',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          age: user.age,
          gender: user.gender,
          city: user.city,
          state: user.state,
          country: user.country,
          phone: user.phone,
          profile_image: user.profile_image,
          profile_photo_url: user.profile_photo_url,
          loginType: user.login_type,
          coinsBalance: user.coins_balance,
          coins: user.coins,
          is_active: user.is_active,
          is_online: user.is_online,
          is_approved: user.is_approved,
          approval_status: user.approval_status,
          profile_completed: user.profile_completed,
          role: user.role,
          languages: user.languages,
          created_at: user.created_at,
          updated_at: user.updated_at,
          last_login: user.last_login
        },
        token: token
      });
    }

    // Create new user with quick login
    const result = await pool.query(
      'INSERT INTO users (name, age, gender, device_id, login_type, is_quick_login_used) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, age || 18, gender || 'male', deviceId, 'quick', true]
    );

    const newUser = result.rows[0];

    // Generate JWT token
    const token = jwt.sign({ userId: newUser.id, loginType: 'quick' }, process.env.JWT_SECRET || 'friendy_secret', { expiresIn: '30d' });

    res.json({
      success: true,
      message: 'Quick login account created successfully',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        age: newUser.age,
        gender: newUser.gender,
        city: newUser.city,
        state: newUser.state,
        country: newUser.country,
        phone: newUser.phone,
        profile_image: newUser.profile_image,
        profile_photo_url: newUser.profile_photo_url,
        loginType: newUser.login_type,
        coinsBalance: newUser.coins_balance,
        coins: newUser.coins,
        is_active: newUser.is_active,
        is_online: newUser.is_online,
        is_approved: newUser.is_approved,
        approval_status: newUser.approval_status,
        profile_completed: newUser.profile_completed,
        role: newUser.role,
        languages: newUser.languages,
        created_at: newUser.created_at,
        updated_at: newUser.updated_at,
        last_login: newUser.last_login
      },
      token: token
    });
  } catch (error) {
    console.error('Quick login error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Quick login failed',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Google login for users
app.post('/auth/user/google-login', async (req, res) => {
  try {
    console.log('🔍 Google login request:', req.body);
    const { googleId, email, name, profileImage } = req.body;

    if (!googleId || !email || !name) {
      return res.status(400).json({ success: false, message: 'Google ID, email, and name are required' });
    }

    // Check if user exists with Google ID
    let user = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);

    if (user.rows.length > 0) {
      // Update existing user
      const existingUser = user.rows[0];
      await pool.query(
        'UPDATE users SET name = $1, email = $2, profile_image = $3, last_login = CURRENT_TIMESTAMP WHERE id = $4',
        [name, email, profileImage, existingUser.id]
      );

      // Generate JWT token
      const token = jwt.sign({ userId: existingUser.id, loginType: 'google' }, process.env.JWT_SECRET || 'friendy_secret', { expiresIn: '30d' });

      return res.json({
        success: true,
        message: 'Google login successful',
        user: {
          id: existingUser.id,
          name: name,
          email: email,
          age: existingUser.age,
          gender: existingUser.gender,
          city: existingUser.city,
          state: existingUser.state,
          country: existingUser.country,
          phone: existingUser.phone,
          profile_image: profileImage,
          profile_photo_url: profileImage,
          loginType: 'google',
          coinsBalance: existingUser.coins_balance,
          coins: existingUser.coins,
          is_active: existingUser.is_active,
          is_online: existingUser.is_online,
          is_approved: existingUser.is_approved,
          approval_status: existingUser.approval_status,
          profile_completed: existingUser.profile_completed,
          role: existingUser.role,
          languages: existingUser.languages,
          created_at: existingUser.created_at,
          updated_at: existingUser.updated_at,
          last_login: existingUser.last_login
        },
        token: token
      });
    }

    // Create new user with Google login
    const result = await pool.query(
      'INSERT INTO users (name, email, google_id, profile_image, login_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, email, googleId, profileImage, 'google']
    );

    const newUser = result.rows[0];

    // Generate JWT token
    const token = jwt.sign({ userId: newUser.id, loginType: 'google' }, process.env.JWT_SECRET || 'friendy_secret', { expiresIn: '30d' });

    res.json({
      success: true,
      message: 'Google account created successfully',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        age: newUser.age,
        gender: newUser.gender,
        city: newUser.city,
        state: newUser.state,
        country: newUser.country,
        phone: newUser.phone,
        profile_image: newUser.profile_image,
        profile_photo_url: newUser.profile_photo_url,
        loginType: newUser.login_type,
        coinsBalance: newUser.coins_balance,
        coins: newUser.coins,
        is_active: newUser.is_active,
        is_online: newUser.is_online,
        is_approved: newUser.is_approved,
        approval_status: newUser.approval_status,
        profile_completed: newUser.profile_completed,
        role: newUser.role,
        languages: newUser.languages,
        created_at: newUser.created_at,
        updated_at: newUser.updated_at,
        last_login: newUser.last_login
      },
      token: token
    });
  } catch (error) {
    console.error('Google login error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Google login failed',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get user profile
app.get('/auth/user/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        password_hash: user.password_hash,
        phone: user.phone,
        age: user.age,
        gender: user.gender,
        city: user.city,
        state: user.state,
        country: user.country,
        profile_image: user.profile_image,
        profile_photo_url: user.profile_photo_url,
        loginType: user.login_type,
        coinsBalance: user.coins_balance,
        coins: user.coins,
        is_active: user.is_active,
        is_online: user.is_online,
        is_approved: user.is_approved,
        approval_status: user.approval_status,
        profile_completed: user.profile_completed,
        role: user.role,
        languages: user.languages,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login: user.last_login
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user profile' });
  }
});

// Get user by ID
app.get('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        password_hash: user.password_hash,
        phone: user.phone,
        age: user.age,
        gender: user.gender,
        city: user.city,
        state: user.state,
        country: user.country,
        profile_image: user.profile_image,
        profile_photo_url: user.profile_photo_url,
        loginType: user.login_type,
        coinsBalance: user.coins_balance,
        coins: user.coins,
        is_active: user.is_active,
        is_online: user.is_online,
        is_approved: user.is_approved,
        approval_status: user.approval_status,
        profile_completed: user.profile_completed,
        role: user.role,
        languages: user.languages,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login: user.last_login
      }
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user',
      error: error.message
    });
  }
});

// ==================== HOST PROFILE ENDPOINTS ====================

// Get host profile
app.get('/api/hosts/:hostId/profile', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query('SELECT * FROM hosts WHERE id = $1', [hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Host not found' });
    }

    const host = result.rows[0];
    res.json({
      success: true,
      host: {
        id: host.id,
        name: host.name,
        email: host.email,
        phone: host.phone,
        age: host.age,
        gender: host.gender,
        city: host.city,
        bio: host.bio,
        profile_image: host.profile_image,
        is_verified: host.is_verified,
        is_online: host.is_online,
        total_earnings: parseFloat(host.total_earnings || 0),
        rating: parseFloat(host.rating || 0)
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
});

// Update host profile
app.put('/api/hosts/:hostId/profile', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;
    const { name, phone, age, gender, city, bio } = req.body;

    const result = await pool.query(
      'UPDATE hosts SET name = $1, phone = $2, age = $3, gender = $4, city = $5, bio = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
      [name, phone, age, gender, city, bio, hostId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Host not found' });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      host: result.rows[0]
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// Update host online status
app.put('/api/hosts/:hostId/status', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;
    const { is_online } = req.body;

    const result = await pool.query(
      'UPDATE hosts SET is_online = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, is_online',
      [is_online, hostId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Host not found' });
    }

    res.json({
      success: true,
      message: 'Status updated successfully',
      host: result.rows[0]
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// Get host earnings
app.get('/api/hosts/:hostId/earnings', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query('SELECT total_earnings FROM hosts WHERE id = $1', [hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Host not found' });
    }

    res.json({
      success: true,
      earnings: {
        total: parseFloat(result.rows[0].total_earnings || 0),
        today: 0, // TODO: Calculate today's earnings
        thisWeek: 0, // TODO: Calculate this week's earnings
        thisMonth: 0 // TODO: Calculate this month's earnings
      }
    });
  } catch (error) {
    console.error('Get earnings error:', error);
    res.status(500).json({ success: false, message: 'Failed to get earnings' });
  }
});

// ==================== STREAMING ENDPOINTS ====================

// Start live stream
app.post('/api/live-streams', authenticateToken, async (req, res) => {
  try {
    const { hostId, title, description } = req.body;

    // Update host to live status
    await pool.query('UPDATE hosts SET is_online = true WHERE id = $1', [hostId]);

    res.json({
      success: true,
      message: 'Live stream started',
      streamId: `stream_${hostId}_${Date.now()}`,
      channelName: `live_${hostId}_${Date.now()}`
    });
  } catch (error) {
    console.error('Start stream error:', error);
    res.status(500).json({ success: false, message: 'Failed to start stream' });
  }
});

// End live stream
app.put('/api/live-streams/:streamId/end', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.body;

    // Update host to offline status
    await pool.query('UPDATE hosts SET is_online = false WHERE id = $1', [hostId]);

    res.json({
      success: true,
      message: 'Live stream ended'
    });
  } catch (error) {
    console.error('End stream error:', error);
    res.status(500).json({ success: false, message: 'Failed to end stream' });
  }
});

// ==================== CALL ENDPOINTS ====================

// Send call request
app.post('/api/call-requests', async (req, res) => {
  try {
    const { customer_id, host_id, call_type, price_per_minute, message } = req.body;

    console.log('📞 Creating call request:', { customer_id, host_id, call_type, price_per_minute });

    // De-duplicate: expire older pending requests for same customer-host
    try {
      await pool.query(
        `UPDATE call_requests
         SET status = 'expired', rejected_at = CURRENT_TIMESTAMP
         WHERE customer_id = $1 AND host_id = $2 AND status = 'pending'`,
        [customer_id, host_id]
      );
    } catch (e) {
      console.warn('⚠️ Failed to expire older pending requests:', e.message);
    }

    const result = await pool.query(`
      INSERT INTO call_requests (
        customer_id, host_id, call_type, price_per_minute, message, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)
      RETURNING *
    `, [customer_id, host_id, call_type, price_per_minute, message || 'Call request']);

    res.status(201).json({
      success: true,
      request_id: result.rows[0].id,
      message: 'Call request sent successfully',
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Send call request error:', error);
    res.status(500).json({ success: false, message: 'Failed to send call request' });
  }
});

// Get call requests for host
app.get('/api/hosts/:hostId/call-requests', async (req, res) => {
  try {
    const { hostId } = req.params;

    console.log('📞 Getting call requests for host:', hostId);

    const result = await pool.query(`
      SELECT cr.*, u.name as customer_name, u.avatar_url as customer_avatar
      FROM call_requests cr
      JOIN users u ON cr.customer_id = u.id
      WHERE cr.host_id = $1 AND cr.status = 'pending'
      ORDER BY cr.created_at DESC
    `, [hostId]);

    res.json({
      success: true,
      requests: result.rows
    });
  } catch (error) {
    console.error('Get call requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to get call requests' });
  }
});

// Accept call request
app.put('/api/call-requests/:requestId/accept', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { host_id, channel_name } = req.body;

    console.log('✅ Accepting call request:', requestId);

    const generatedChannelName = channel_name || `call_${host_id}_${Date.now()}`;

    // First, expire any other pending requests for the same customer-host pair
    await pool.query(`
      UPDATE call_requests
      SET status = 'expired', rejected_at = CURRENT_TIMESTAMP
      WHERE customer_id = (
        SELECT customer_id FROM call_requests WHERE id = $1
      ) AND host_id = $2 AND status = 'pending' AND id != $1
    `, [requestId, host_id]);

    const result = await pool.query(`
      UPDATE call_requests
      SET status = 'accepted', channel_name = $1, accepted_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND status = 'pending'
      RETURNING *
    `, [generatedChannelName, requestId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Call request not found or already processed'
      });
    }

    // Build Agora token here so client can join without extra roundtrip
    let token = null;
    let uid = 1; // fixed non-zero uid for host side
    try {
      if (RtcTokenBuilder && RtcRole && AGORA_APP_ID && AGORA_APP_CERTIFICATE) {
        const expireSeconds = 24 * 60 * 60; // 24h
        const currentTs = Math.floor(Date.now() / 1000);
        const privilegeExpireTs = currentTs + expireSeconds;
        token = RtcTokenBuilder.buildTokenWithUid(
          AGORA_APP_ID,
          AGORA_APP_CERTIFICATE,
          generatedChannelName,
          Number(uid),
          RtcRole.PUBLISHER,
          privilegeExpireTs
        );
      }
    } catch (e) {
      console.error('⚠️ Failed to pre-generate Agora token on accept:', e.message);
    }

    console.log('✅ Call request accepted successfully:', {
      requestId,
      channelName: generatedChannelName,
      hostId: host_id
    });

    res.json({
      success: true,
      message: 'Call request accepted',
      channel_name: generatedChannelName,
      agora_app_id: AGORA_APP_ID,
      token,
      agora_token: token,
      uid,
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Accept call error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept call' });
  }
});

// Get call request status (for customer to monitor)
app.get('/api/call-requests/:requestId/status', async (req, res) => {
  try {
    const { requestId } = req.params;
    let uidParam = req.query?.uid; // optional uid for generating a customer token

    console.log('📞 Getting call request status:', requestId);

    const result = await pool.query(`
      SELECT * FROM call_requests WHERE id = $1
    `, [requestId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Call request not found'
      });
    }

    let request = result.rows[0];

    let customerToken = null;
    let uidEcho = undefined;
    if (request.status === 'accepted') {
      try {
        const uidNum = Number(uidParam ?? 2); // default customer uid=2 if not provided
        if (!isNaN(uidNum) && RtcTokenBuilder && RtcRole && AGORA_APP_ID && AGORA_APP_CERTIFICATE && request.channel_name) {
          const expireSeconds = 24 * 60 * 60;
          const currentTs = Math.floor(Date.now() / 1000);
          const privilegeExpireTs = currentTs + expireSeconds;
          customerToken = RtcTokenBuilder.buildTokenWithUid(
            AGORA_APP_ID,
            AGORA_APP_CERTIFICATE,
            request.channel_name,
            uidNum,
            RtcRole.SUBSCRIBER,
            privilegeExpireTs
          );
          uidEcho = uidNum;
        }
      } catch (e) {
        console.error('⚠️ Failed to generate customer token in status:', e.message);
      }
    } else if (request.status === 'pending') {
      // Fallback: if another request for same pair was accepted, return that so customer can proceed
      try {
        const sibling = await pool.query(
          `SELECT * FROM call_requests 
           WHERE customer_id = $1 AND host_id = $2 AND status = 'accepted' 
           ORDER BY accepted_at DESC NULLS LAST, created_at DESC 
           LIMIT 1`,
          [request.customer_id, request.host_id]
        );
        if (sibling.rows.length > 0) {
          request = sibling.rows[0];
          const uidNum = Number(uidParam ?? 2);
          if (!isNaN(uidNum) && RtcTokenBuilder && RtcRole && AGORA_APP_ID && AGORA_APP_CERTIFICATE && request.channel_name) {
            const expireSeconds = 24 * 60 * 60;
            const currentTs = Math.floor(Date.now() / 1000);
            const privilegeExpireTs = currentTs + expireSeconds;
            customerToken = RtcTokenBuilder.buildTokenWithUid(
              AGORA_APP_ID,
              AGORA_APP_CERTIFICATE,
              request.channel_name,
              uidNum,
              RtcRole.SUBSCRIBER,
              privilegeExpireTs
            );
            uidEcho = uidNum;
          }
        }
      } catch (e) {
        console.warn('⚠️ Fallback search for accepted sibling failed:', e.message);
      }
    }

    res.json({
      success: true,
      status: request.status,
      channel_name: request.channel_name,
      agora_app_id: request.status === 'accepted' ? AGORA_APP_ID : null,
      token: customerToken,
      rtcToken: customerToken,
      uid: uidEcho,
      request: request
    });
  } catch (error) {
    console.error('❌ Error getting call request status:', error);
    res.status(500).json({ success: false, message: 'Failed to get call request status' });
  }
});

// Reject call request
app.put('/api/call-requests/:requestId/reject', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { host_id, reason } = req.body;

    console.log('❌ Rejecting call request:', requestId);

    const result = await pool.query(`
      UPDATE call_requests
      SET status = 'rejected', rejection_reason = $1, rejected_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND status = 'pending'
      RETURNING *
    `, [reason || 'Host declined the call', requestId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Call request not found or already processed'
      });
    }

    res.json({
      success: true,
      message: 'Call request rejected',
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Reject call error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject call' });
  }
});

// Start call session
app.post('/api/call-sessions', async (req, res) => {
  try {
    const { request_id, channel_name, call_type, price_per_minute } = req.body;

    console.log('🎬 Starting call session:', { request_id, channel_name, call_type });

    const result = await pool.query(`
      INSERT INTO call_sessions (
        request_id, channel_name, call_type, price_per_minute, start_time, status
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'active')
      RETURNING *
    `, [request_id, channel_name, call_type, price_per_minute]);

    res.status(201).json({
      success: true,
      session_id: result.rows[0].id,
      message: 'Call session started',
      session: result.rows[0]
    });
  } catch (error) {
    console.error('Start call session error:', error);
    res.status(500).json({ success: false, message: 'Failed to start call session' });
  }
});

// End call session
app.put('/api/call-sessions/:sessionId/end', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { duration_seconds, total_cost } = req.body;

    console.log('🛑 Ending call session:', sessionId);

    const result = await pool.query(`
      UPDATE call_sessions
      SET end_time = CURRENT_TIMESTAMP, duration_seconds = $1, total_cost = $2, status = 'completed'
      WHERE id = $3 AND status = 'active'
      RETURNING *
    `, [duration_seconds, total_cost, sessionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Call session not found or already ended'
      });
    }

    // Update host earnings
    const session = result.rows[0];
    const callRequest = await pool.query(`
      SELECT host_id FROM call_requests WHERE id = $1
    `, [session.request_id]);

    if (callRequest.rows.length > 0) {
      await pool.query(`
        UPDATE users
        SET total_earnings = total_earnings + $1, total_calls = total_calls + 1
        WHERE id = $2
      `, [total_cost, callRequest.rows[0].host_id]);
    }

    res.json({
      success: true,
      message: 'Call session ended',
      total_cost: total_cost,
      session: result.rows[0]
    });
  } catch (error) {
    console.error('End call session error:', error);
    res.status(500).json({ success: false, message: 'Failed to end call session' });
  }
});

// Get call history for user
app.get('/api/users/:userId/call-history', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('📋 Getting call history for user:', userId);

    const result = await pool.query(`
      SELECT
        cs.*,
        cr.customer_id,
        cr.host_id,
        customer.name as customer_name,
        host.name as host_name,
        customer.avatar_url as customer_avatar,
        host.avatar_url as host_avatar
      FROM call_sessions cs
      JOIN call_requests cr ON cs.request_id = cr.id
      JOIN users customer ON cr.customer_id = customer.id
      JOIN users host ON cr.host_id = host.id
      WHERE cr.customer_id = $1 OR cr.host_id = $1
      ORDER BY cs.start_time DESC
      LIMIT 50
    `, [userId]);

    res.json({
      success: true,
      calls: result.rows
    });
  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({ success: false, message: 'Failed to get call history' });
  }
});

// ==================== MESSAGING ENDPOINTS ====================

// Get messages for host
app.get('/api/hosts/:hostId/messages', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;

    // For now, return empty array - implement messages table later
    res.json({
      success: true,
      messages: []
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to get messages' });
  }
});

// Send message
app.post('/api/messages', authenticateToken, async (req, res) => {
  try {
    const { senderId, receiverId, message, messageType } = req.body;

    res.json({
      success: true,
      message: 'Message sent successfully',
      messageId: `msg_${Date.now()}`
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// Admin dashboard stats
app.get('/admin/dashboard', async (req, res) => {
  try {
    console.log('Admin dashboard request');

    const hostsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_host_approved = true) as approved,
        COUNT(*) FILTER (WHERE is_host_approved = false) as pending
      FROM users
      WHERE role = 'host'
    `);
    const usersResult = await pool.query("SELECT COUNT(*) as total FROM users WHERE role = 'customer'");

    const stats = {
      total_hosts: parseInt(hostsResult.rows[0].total),
      approved_hosts: parseInt(hostsResult.rows[0].approved),
      pending_hosts: parseInt(hostsResult.rows[0].pending),
      total_customers: parseInt(usersResult.rows[0].total)
    };

    res.json({
      success: true,
      stats: stats,
      message: 'Dashboard stats retrieved successfully'
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get dashboard stats' });
  }
});

// Get all hosts (for admin panel)
app.get('/admin/hosts', async (req, res) => {
  try {
    console.log('Admin hosts request');

    const result = await pool.query(`
      SELECT
        id, name, email, age, gender, city, state, country,
        is_vip, vip_status, online_status, busy_status, live_status,
        host_rating, video_call_rate, voice_call_rate, message_rate,
        is_host_approved, host_bio, host_specialties, host_languages,
        total_calls, total_earnings, created_at, last_login,
        CASE
          WHEN is_vip = true AND online_status = 'online' THEN 100
          WHEN is_vip = true AND live_status = 'live' THEN 90
          WHEN is_vip = true AND busy_status = 'busy' THEN 80
          WHEN live_status = 'live' THEN 70
          WHEN busy_status = 'busy' THEN 60
          WHEN online_status = 'online' THEN 50
          ELSE 0
        END as calculated_priority
      FROM users
      WHERE role = 'host'
      ORDER BY calculated_priority DESC, created_at DESC
    `);

    console.log(`📊 Found ${result.rows.length} hosts for admin panel`);

    res.json({
      success: true,
      hosts: result.rows,
      message: 'Hosts retrieved successfully'
    });
  } catch (error) {
    console.error('Get hosts error:', error);
    res.status(500).json({ success: false, message: 'Failed to get hosts' });
  }
});

// Get pending host requests
app.get('/admin/host-requests', async (req, res) => {
  try {
    console.log('Admin host requests');

    const result = await pool.query(`
      SELECT
        id, name, email, age, gender, city, state, country,
        host_bio as bio, host_specialties, host_languages,
        video_call_rate, voice_call_rate, message_rate,
        created_at, last_login
      FROM users
      WHERE role = 'host' AND is_host_approved = false
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      requests: result.rows,
      message: 'Host requests retrieved successfully'
    });
  } catch (error) {
    console.error('Get host requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to get host requests' });
  }
});

// Approve host
app.post('/admin/approve-host/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    console.log('✅ Approving host request received for ID:', hostId);

    const result = await pool.query(`
      UPDATE users
      SET is_host_approved = true
      WHERE id = $1 AND role = 'host'
      RETURNING id, name, email, is_host_approved
    `, [hostId]);

    console.log('💾 Query result:', result.rows);
    console.log('💾 Rows affected:', result.rowCount);

    if (result.rows.length === 0) {
      console.log('❌ Host not found in database');
      return res.status(404).json({ success: false, message: 'Host not found' });
    }

    console.log('✅ Host approved successfully:', result.rows[0]);
    res.json({
      success: true,
      message: 'Host approved successfully',
      host: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Approve host error:', error);
    console.error('❌ Error details:', error.message);
    res.status(500).json({ success: false, message: 'Failed to approve host', error: error.message });
  }
});

// Reject host
app.post('/admin/reject-host/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    console.log('❌ Rejecting host:', hostId);

    const result = await pool.query(`
      DELETE FROM users
      WHERE id = $1 AND role = 'host' AND is_host_approved = false
      RETURNING id, name, email
    `, [hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Host not found or already approved' });
    }

    res.json({
      success: true,
      message: 'Host rejected successfully',
      host: result.rows[0]
    });
  } catch (error) {
    console.error('Reject host error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject host' });
  }
});

// Delete host
app.delete('/admin/delete-host/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    console.log('🗑️ Deleting host:', hostId);

    const result = await pool.query('DELETE FROM hosts WHERE id = $1 RETURNING id, name, email', [hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Host not found' });
    }

    res.json({
      success: true,
      message: 'Host deleted successfully',
      host: result.rows[0]
    });
  } catch (error) {
    console.error('Delete host error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete host' });
  }
});

// Reset database (recreate tables)
app.post('/admin/reset-database', async (req, res) => {
  try {
    console.log('🔄 Resetting database tables...');

    // Drop and recreate users table to ensure correct schema
    try {
      await pool.query('DROP TABLE IF EXISTS users CASCADE');
      console.log('✅ Users table dropped successfully');
    } catch (error) {
      console.log('⚠️ Users table drop warning:', error.message);
      // Continue even if drop fails
    }

    // Create hosts table with correct schema (if not exists)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hosts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        age INTEGER,
        gender VARCHAR(10),
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100),
        bio TEXT,
        languages TEXT[],
        profile_image TEXT,
        is_verified BOOLEAN DEFAULT false,
        is_online BOOLEAN DEFAULT false,
        rating DECIMAL(3,2) DEFAULT 0.00,
        total_earnings DECIMAL(10,2) DEFAULT 0.00,
        bank_account_number VARCHAR(50),
        bank_ifsc VARCHAR(20),
        bank_name VARCHAR(100),
        approval_status VARCHAR(20) DEFAULT 'pending',
        is_approved BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create users table with correct schema (matching frontend expectations)
    await pool.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        password_hash VARCHAR(255),
        phone VARCHAR(20),
        age INTEGER DEFAULT 18,
        gender VARCHAR(10) DEFAULT 'male',
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100),
        profile_image TEXT,
        profile_photo_url TEXT,
        device_id VARCHAR(255) UNIQUE,
        login_type VARCHAR(20) NOT NULL, -- 'quick', 'google', 'email'
        google_id VARCHAR(255) UNIQUE,
        is_quick_login_used BOOLEAN DEFAULT false,
        coins INTEGER DEFAULT 0,
        coins_balance INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        is_online BOOLEAN DEFAULT false,
        is_approved BOOLEAN DEFAULT true,
        approval_status VARCHAR(20) DEFAULT 'approved',
        profile_completed BOOLEAN DEFAULT true,
        role VARCHAR(20) DEFAULT 'customer',
        languages TEXT[],
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database reset successful');
    res.json({
      success: true,
      message: 'Database reset successfully'
    });
  } catch (error) {
    console.error('Database reset error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to reset database',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Create users table only
app.post('/admin/create-users-table', async (req, res) => {
  try {
    console.log('🔄 Creating users table...');

    // Create users table with correct schema (matching frontend expectations)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        password_hash VARCHAR(255),
        phone VARCHAR(20),
        age INTEGER DEFAULT 18,
        gender VARCHAR(10) DEFAULT 'male',
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100),
        profile_image TEXT,
        profile_photo_url TEXT,
        device_id VARCHAR(255) UNIQUE,
        login_type VARCHAR(20) NOT NULL DEFAULT 'quick', -- 'quick', 'google', 'email'
        google_id VARCHAR(255) UNIQUE,
        is_quick_login_used BOOLEAN DEFAULT false,
        coins INTEGER DEFAULT 0,
        coins_balance INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        is_online BOOLEAN DEFAULT false,
        is_approved BOOLEAN DEFAULT true,
        approval_status VARCHAR(20) DEFAULT 'approved',
        profile_completed BOOLEAN DEFAULT true,
        role VARCHAR(20) DEFAULT 'customer',
        languages TEXT[],
        -- Host Status Fields
        is_vip BOOLEAN DEFAULT false,
        vip_status VARCHAR(20) DEFAULT 'none', -- 'none', 'vip', 'premium'
        online_status VARCHAR(20) DEFAULT 'offline', -- 'online', 'offline'
        busy_status VARCHAR(20) DEFAULT 'available', -- 'available', 'busy'
        live_status VARCHAR(20) DEFAULT 'offline', -- 'live', 'offline'
        host_priority INTEGER DEFAULT 0, -- Calculated priority for sorting
        host_rating DECIMAL(3,2) DEFAULT 0.0, -- Host rating out of 5
        total_calls INTEGER DEFAULT 0, -- Total calls received
        total_earnings DECIMAL(10,2) DEFAULT 0.0, -- Total earnings in INR
        hourly_rate DECIMAL(8,2) DEFAULT 0.0, -- Hourly rate in INR
        video_call_rate DECIMAL(8,2) DEFAULT 0.0, -- Video call rate per minute
        voice_call_rate DECIMAL(8,2) DEFAULT 0.0, -- Voice call rate per minute
        message_rate DECIMAL(8,2) DEFAULT 0.0, -- Message rate
        is_host_approved BOOLEAN DEFAULT false, -- Admin approval for hosting
        host_bio TEXT, -- Host-specific bio
        host_specialties TEXT[], -- Array of specialties
        host_languages TEXT[], -- Array of languages spoken
        availability_hours JSONB, -- JSON object for availability schedule
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Users table created successfully');
    res.json({
      success: true,
      message: 'Users table created successfully'
    });
  } catch (error) {
    console.error('Create users table error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to create users table',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Host Management Endpoints

// Get all hosts with priority filtering
app.get('/api/hosts', async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    // Calculate priority for each host
    // Priority: VIP+Online(100) > VIP+Live(90) > VIP+Busy(80) > Live(70) > Busy(60) > Online(50)
    let query = `
      SELECT *,
        CASE
          WHEN is_vip = true AND online_status = 'online' THEN 100
          WHEN is_vip = true AND live_status = 'live' THEN 90
          WHEN is_vip = true AND busy_status = 'busy' THEN 80
          WHEN live_status = 'live' THEN 70
          WHEN busy_status = 'busy' THEN 60
          WHEN online_status = 'online' THEN 50
          ELSE 0
        END as calculated_priority
      FROM users
      WHERE role = 'host' AND is_host_approved = true
    `;

    // Add status filter if provided
    if (status) {
      switch (status) {
        case 'vip':
          query += ` AND is_vip = true`;
          break;
        case 'online':
          query += ` AND online_status = 'online'`;
          break;
        case 'live':
          query += ` AND live_status = 'live'`;
          break;
        case 'busy':
          query += ` AND busy_status = 'busy'`;
          break;
      }
    }

    query += ` ORDER BY calculated_priority DESC, host_rating DESC, created_at DESC LIMIT $1 OFFSET $2`;

    const result = await pool.query(query, [limit, offset]);

    res.json({
      success: true,
      hosts: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching hosts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hosts',
      error: error.message
    });
  }
});

// Update host status
app.put('/api/hosts/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { online_status, busy_status, live_status } = req.body;

    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (online_status !== undefined) {
      updateFields.push(`online_status = $${paramCount}`);
      values.push(online_status);
      paramCount++;
    }

    if (busy_status !== undefined) {
      updateFields.push(`busy_status = $${paramCount}`);
      values.push(busy_status);
      paramCount++;
    }

    if (live_status !== undefined) {
      updateFields.push(`live_status = $${paramCount}`);
      values.push(live_status);
      paramCount++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No status fields provided'
      });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE users
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount} AND role = 'host'
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Host not found'
      });
    }

    res.json({
      success: true,
      host: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating host status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update host status',
      error: error.message
    });
  }
});

// Admin: Update VIP status
app.put('/api/admin/hosts/:id/vip', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_vip, vip_status } = req.body;

    const result = await pool.query(
      `UPDATE users
       SET is_vip = $1, vip_status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND role = 'host'
       RETURNING *`,
      [is_vip, vip_status || (is_vip ? 'vip' : 'none'), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Host not found'
      });
    }

    res.json({
      success: true,
      message: 'VIP status updated successfully',
      host: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating VIP status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update VIP status',
      error: error.message
    });
  }
});

// Admin: Update host status (online/busy/live)
app.put('/api/admin/hosts/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { online_status, busy_status, live_status } = req.body;

    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (online_status !== undefined) {
      updateFields.push(`online_status = $${paramCount}`);
      values.push(online_status);
      paramCount++;
    }

    if (busy_status !== undefined) {
      updateFields.push(`busy_status = $${paramCount}`);
      values.push(busy_status);
      paramCount++;
    }

    if (live_status !== undefined) {
      updateFields.push(`live_status = $${paramCount}`);
      values.push(live_status);
      paramCount++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No status fields provided'
      });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE users
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount} AND role = 'host'
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Host not found'
      });
    }

    res.json({
      success: true,
      message: 'Host status updated successfully',
      host: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating host status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update host status',
      error: error.message
    });
  }
});

// Get host profile by ID
app.get('/api/hosts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM users WHERE id = $1 AND role = 'host'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Host not found'
      });
    }

    res.json({
      success: true,
      host: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching host profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch host profile',
      error: error.message
    });
  }
});

// Add host columns to existing users table
app.post('/admin/add-host-columns', async (req, res) => {
  try {
    console.log('🔄 Adding host columns to users table...');

    // Add host status columns
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS vip_status VARCHAR(20) DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS online_status VARCHAR(20) DEFAULT 'offline',
      ADD COLUMN IF NOT EXISTS busy_status VARCHAR(20) DEFAULT 'available',
      ADD COLUMN IF NOT EXISTS live_status VARCHAR(20) DEFAULT 'offline',
      ADD COLUMN IF NOT EXISTS host_priority INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS host_rating DECIMAL(3,2) DEFAULT 0.0,
      ADD COLUMN IF NOT EXISTS total_calls INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(10,2) DEFAULT 0.0,
      ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(8,2) DEFAULT 0.0,
      ADD COLUMN IF NOT EXISTS video_call_rate DECIMAL(8,2) DEFAULT 0.0,
      ADD COLUMN IF NOT EXISTS voice_call_rate DECIMAL(8,2) DEFAULT 0.0,
      ADD COLUMN IF NOT EXISTS message_rate DECIMAL(8,2) DEFAULT 0.0,
      ADD COLUMN IF NOT EXISTS is_host_approved BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS host_bio TEXT,
      ADD COLUMN IF NOT EXISTS host_specialties TEXT[],
      ADD COLUMN IF NOT EXISTS host_languages TEXT[],
      ADD COLUMN IF NOT EXISTS availability_hours JSONB
    `);

    console.log('✅ Host columns added successfully');
    res.json({
      success: true,
      message: 'Host columns added successfully'
    });
  } catch (error) {
    console.error('❌ Error adding host columns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add host columns',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Create sample hosts for testing
app.post('/api/create-sample-hosts', async (req, res) => {
  try {
    const sampleHosts = [
      {
        name: 'Priya Sharma',
        email: 'priya.host@friendy.app',
        age: 24,
        gender: 'female',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        role: 'host',
        is_vip: true,
        vip_status: 'vip',
        online_status: 'online',
        busy_status: 'available',
        live_status: 'offline',
        host_rating: 4.8,
        video_call_rate: 50.0,
        voice_call_rate: 30.0,
        message_rate: 10.0,
        is_host_approved: true,
        host_bio: 'Friendly and engaging host from Mumbai. Love to chat and make new friends!',
        host_specialties: ['Casual Chat', 'Entertainment', 'Friendship'],
        host_languages: ['Hindi', 'English', 'Marathi']
      },
      {
        name: 'Ananya Gupta',
        email: 'ananya.host@friendy.app',
        age: 22,
        gender: 'female',
        city: 'Delhi',
        state: 'Delhi',
        country: 'India',
        role: 'host',
        is_vip: true,
        vip_status: 'premium',
        online_status: 'offline',
        busy_status: 'available',
        live_status: 'live',
        host_rating: 4.9,
        video_call_rate: 75.0,
        voice_call_rate: 45.0,
        message_rate: 15.0,
        is_host_approved: true,
        host_bio: 'Premium host with amazing conversation skills. Currently live streaming!',
        host_specialties: ['Live Streaming', 'Entertainment', 'Music'],
        host_languages: ['Hindi', 'English', 'Punjabi']
      },
      {
        name: 'Kavya Reddy',
        email: 'kavya.host@friendy.app',
        age: 26,
        gender: 'female',
        city: 'Bangalore',
        state: 'Karnataka',
        country: 'India',
        role: 'host',
        is_vip: false,
        vip_status: 'none',
        online_status: 'offline',
        busy_status: 'busy',
        live_status: 'offline',
        host_rating: 4.5,
        video_call_rate: 40.0,
        voice_call_rate: 25.0,
        message_rate: 8.0,
        is_host_approved: true,
        host_bio: 'Tech-savvy host from Bangalore. Currently busy but will be back soon!',
        host_specialties: ['Technology', 'Career Advice', 'Casual Chat'],
        host_languages: ['English', 'Hindi', 'Kannada']
      },
      {
        name: 'Riya Patel',
        email: 'riya.host@friendy.app',
        age: 23,
        gender: 'female',
        city: 'Ahmedabad',
        state: 'Gujarat',
        country: 'India',
        role: 'host',
        is_vip: false,
        vip_status: 'none',
        online_status: 'offline',
        busy_status: 'available',
        live_status: 'live',
        host_rating: 4.6,
        video_call_rate: 35.0,
        voice_call_rate: 20.0,
        message_rate: 7.0,
        is_host_approved: true,
        host_bio: 'Fun-loving host from Gujarat. Join my live stream for entertainment!',
        host_specialties: ['Entertainment', 'Dance', 'Music'],
        host_languages: ['Gujarati', 'Hindi', 'English']
      },
      {
        name: 'Sneha Singh',
        email: 'sneha.host@friendy.app',
        age: 25,
        gender: 'female',
        city: 'Pune',
        state: 'Maharashtra',
        country: 'India',
        role: 'host',
        is_vip: true,
        vip_status: 'vip',
        online_status: 'offline',
        busy_status: 'busy',
        live_status: 'offline',
        host_rating: 4.7,
        video_call_rate: 60.0,
        voice_call_rate: 35.0,
        message_rate: 12.0,
        is_host_approved: true,
        host_bio: 'VIP host from Pune. Currently busy with other clients.',
        host_specialties: ['Relationship Advice', 'Casual Chat', 'Entertainment'],
        host_languages: ['Hindi', 'English', 'Marathi']
      },
      {
        name: 'Meera Joshi',
        email: 'meera.host@friendy.app',
        age: 21,
        gender: 'female',
        city: 'Jaipur',
        state: 'Rajasthan',
        country: 'India',
        role: 'host',
        is_vip: false,
        vip_status: 'none',
        online_status: 'online',
        busy_status: 'available',
        live_status: 'offline',
        host_rating: 4.4,
        video_call_rate: 30.0,
        voice_call_rate: 18.0,
        message_rate: 6.0,
        is_host_approved: true,
        host_bio: 'Young and energetic host from the Pink City. Ready to chat!',
        host_specialties: ['Casual Chat', 'Friendship', 'Entertainment'],
        host_languages: ['Hindi', 'English', 'Rajasthani']
      }
    ];

    const insertedHosts = [];

    for (const host of sampleHosts) {
      const result = await pool.query(`
        INSERT INTO users (
          name, email, age, gender, city, state, country, role,
          is_vip, vip_status, online_status, busy_status, live_status,
          host_rating, video_call_rate, voice_call_rate, message_rate,
          is_host_approved, host_bio, host_specialties, host_languages,
          login_type, profile_completed, is_approved
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        ) RETURNING *
      `, [
        host.name, host.email, host.age, host.gender, host.city, host.state, host.country, host.role,
        host.is_vip, host.vip_status, host.online_status, host.busy_status, host.live_status,
        host.host_rating, host.video_call_rate, host.voice_call_rate, host.message_rate,
        host.is_host_approved, host.host_bio, host.host_specialties, host.host_languages,
        'email', true, true
      ]);

      insertedHosts.push(result.rows[0]);
    }

    res.json({
      success: true,
      message: `Created ${insertedHosts.length} sample hosts`,
      hosts: insertedHosts
    });
  } catch (error) {
    console.error('Error creating sample hosts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sample hosts',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Create call management tables
app.post('/create-call-tables', async (req, res) => {
  try {
    console.log('Creating call management tables...');

    // Drop existing tables if they exist with wrong schema
    const dropTablesQuery = `
      DROP TABLE IF EXISTS call_sessions CASCADE;
      DROP TABLE IF EXISTS call_requests CASCADE;
    `;

    // Create call_requests table
    const createCallRequestsQuery = `
      CREATE TABLE call_requests (
        id SERIAL PRIMARY KEY,
        customer_id VARCHAR(255) NOT NULL,
        host_id VARCHAR(255) NOT NULL,
        call_type VARCHAR(20) NOT NULL, -- 'video' or 'voice'
        price_per_minute DECIMAL(8,2) NOT NULL,
        message TEXT,
        status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'expired'
        channel_name VARCHAR(255), -- Agora channel name
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        accepted_at TIMESTAMP,
        rejected_at TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '5 minutes')
      );
    `;

    // Create call_sessions table
    const createCallSessionsQuery = `
      CREATE TABLE call_sessions (
        id SERIAL PRIMARY KEY,
        call_request_id INTEGER REFERENCES call_requests(id),
        channel_name VARCHAR(255) NOT NULL,
        call_type VARCHAR(20) NOT NULL,
        price_per_minute DECIMAL(8,2) NOT NULL,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        duration_seconds INTEGER,
        total_cost DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'cancelled'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create indexes for better performance
    const createIndexesQuery = `
      CREATE INDEX idx_call_requests_host_status ON call_requests(host_id, status);
      CREATE INDEX idx_call_requests_customer ON call_requests(customer_id);
      CREATE INDEX idx_call_sessions_request ON call_sessions(call_request_id);
      CREATE INDEX idx_call_sessions_status ON call_sessions(status);
    `;

    await pool.query(dropTablesQuery);
    console.log('✅ Dropped existing tables');

    await pool.query(createCallRequestsQuery);
    console.log('✅ Call requests table created');

    await pool.query(createCallSessionsQuery);
    console.log('✅ Call sessions table created');

    await pool.query(createIndexesQuery);
    console.log('✅ Indexes created');

    console.log('✅ Call management tables created successfully');
    res.json({
      success: true,
      message: 'Call management tables created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating call tables:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create call tables',
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  console.log('404 - Endpoint not found:', req.method, req.path);
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

app.listen(port, () => {
  console.log(`🚀 Friendy Simple Backend Server running on port ${port}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`✅ Ready to serve requests!`);
});

module.exports = app;
