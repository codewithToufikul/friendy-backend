require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8080',
    'http://192.168.29.237:3000',
    'https://friendy.app',
    'https://admin-panel-friendy-o2ph5c5o3-bhardwajvaishnavis-projects.vercel.app',
    'https://*.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// PostgreSQL connection
console.log('🔍 Environment check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL preview:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'NOT SET');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://friendy_owner:password@localhost:5432/friendy_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'friendy_host_app_secret_key_2024';

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'host-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Database initialization
async function initializeDatabase() {
  try {
    // Create hosts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hosts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        age INTEGER,
        gender VARCHAR(20),
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100) DEFAULT 'India',
        bio TEXT,
        profile_photo_url TEXT,
        languages TEXT[], -- Array of languages
        is_online BOOLEAN DEFAULT false,
        is_live BOOLEAN DEFAULT false,
        is_verified BOOLEAN DEFAULT false,
        total_earnings DECIMAL(10,2) DEFAULT 0.00,
        total_calls INTEGER DEFAULT 0,
        total_minutes INTEGER DEFAULT 0,
        rating DECIMAL(3,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create host_pricing table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS host_pricing (
        id SERIAL PRIMARY KEY,
        host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
        video_call_rate DECIMAL(8,2) DEFAULT 150.00,
        voice_call_rate DECIMAL(8,2) DEFAULT 100.00,
        message_rate DECIMAL(8,2) DEFAULT 5.00,
        streaming_rate DECIMAL(8,2) DEFAULT 50.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(host_id)
      )
    `);

    // Create call_sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS call_sessions (
        id SERIAL PRIMARY KEY,
        host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
        customer_id INTEGER,
        customer_name VARCHAR(255),
        call_type VARCHAR(20) NOT NULL, -- 'video', 'voice'
        channel_name VARCHAR(255),
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        duration_minutes INTEGER DEFAULT 0,
        rate_per_minute DECIMAL(8,2),
        total_amount DECIMAL(10,2) DEFAULT 0.00,
        status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'active', 'completed', 'cancelled'
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create streaming_sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS streaming_sessions (
        id SERIAL PRIMARY KEY,
        host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
        channel_name VARCHAR(255),
        title VARCHAR(255),
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        duration_minutes INTEGER DEFAULT 0,
        max_viewers INTEGER DEFAULT 0,
        total_viewers INTEGER DEFAULT 0,
        earnings DECIMAL(10,2) DEFAULT 0.00,
        status VARCHAR(20) DEFAULT 'live', -- 'live', 'ended'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
        customer_id INTEGER,
        customer_name VARCHAR(255),
        conversation_id VARCHAR(255),
        sender_type VARCHAR(20) NOT NULL, -- 'host', 'customer'
        message_type VARCHAR(20) DEFAULT 'text', -- 'text', 'image', 'voice'
        content TEXT,
        file_url TEXT,
        amount DECIMAL(8,2) DEFAULT 0.00,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create transactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
        transaction_type VARCHAR(20) NOT NULL, -- 'call', 'message', 'streaming', 'withdrawal'
        reference_id INTEGER, -- ID of call_session, streaming_session, etc.
        amount DECIMAL(10,2) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'completed', -- 'pending', 'completed', 'failed'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create withdrawals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        bank_account_number VARCHAR(50),
        bank_ifsc VARCHAR(20),
        bank_name VARCHAR(100),
        account_holder_name VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_hosts_email ON hosts(email);
      CREATE INDEX IF NOT EXISTS idx_call_sessions_host_id ON call_sessions(host_id);
      CREATE INDEX IF NOT EXISTS idx_streaming_sessions_host_id ON streaming_sessions(host_id);
      CREATE INDEX IF NOT EXISTS idx_messages_host_id ON messages(host_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_host_id ON transactions(host_id);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_host_id ON withdrawals(host_id);
    `);

    console.log('✅ Database initialized successfully!');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    process.exit(1);
  }
}

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Friendy Production API is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ==================== AUTHENTICATION ENDPOINTS ====================

// Host Registration
app.post('/auth/host/register', async (req, res) => {
  try {
    const { name, email, password, phone, age, gender, city, state, bio, languages } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required'
      });
    }

    // Check if host already exists
    const existingHost = await pool.query(
      'SELECT id FROM hosts WHERE email = $1',
      [email]
    );

    if (existingHost.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Host with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert new host (is_verified defaults to false for new registrations)
    const result = await pool.query(`
      INSERT INTO hosts (name, email, password_hash, phone, age, gender, city, state, bio, languages, is_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
      RETURNING id, name, email, phone, age, gender, city, state, bio, languages, is_verified, created_at
    `, [name, email, passwordHash, phone, age, gender, city, state, bio, languages]);

    const newHost = result.rows[0];

    // Create default pricing for the host
    await pool.query(`
      INSERT INTO host_pricing (host_id, video_call_rate, voice_call_rate, message_rate, streaming_rate)
      VALUES ($1, 150.00, 100.00, 5.00, 50.00)
    `, [newHost.id]);

    // Generate JWT token
    const token = jwt.sign(
      { hostId: newHost.id, email: newHost.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Host registered successfully',
      user: {
        id: newHost.id,
        name: newHost.name,
        email: newHost.email,
        phone: newHost.phone,
        age: newHost.age,
        gender: newHost.gender,
        city: newHost.city,
        state: newHost.state,
        bio: newHost.bio,
        languages: newHost.languages,
        isVerified: newHost.is_verified,
        isOnline: false,
        totalEarnings: 0,
        totalCalls: 0,
        rating: 0,
        createdAt: newHost.created_at
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during registration'
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

    // Find host by email
    const result = await pool.query(
      'SELECT * FROM hosts WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const host = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, host.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Update last login
    await pool.query(
      'UPDATE hosts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [host.id]
    );

    // Generate JWT token
    const token = jwt.sign(
      { hostId: host.id, email: host.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: host.id,
        name: host.name,
        email: host.email,
        phone: host.phone,
        age: host.age,
        gender: host.gender,
        city: host.city,
        state: host.state,
        bio: host.bio,
        languages: host.languages,
        profilePhotoUrl: host.profile_photo_url,
        isOnline: host.is_online,
        isLive: host.is_live,
        totalEarnings: parseFloat(host.total_earnings),
        totalCalls: host.total_calls,
        rating: parseFloat(host.rating)
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during login'
    });
  }
});

// ==================== HOST PROFILE ENDPOINTS ====================

// Get host profile
app.get('/api/hosts/:hostId/profile', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;

    // Verify the requesting user is the host or admin
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const result = await pool.query(`
      SELECT h.*, hp.video_call_rate, hp.voice_call_rate, hp.message_rate, hp.streaming_rate
      FROM hosts h
      LEFT JOIN host_pricing hp ON h.id = hp.host_id
      WHERE h.id = $1
    `, [hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Host not found'
      });
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
        state: host.state,
        country: host.country,
        bio: host.bio,
        languages: host.languages,
        profilePhotoUrl: host.profile_photo_url,
        isOnline: host.is_online,
        isLive: host.is_live,
        totalEarnings: parseFloat(host.total_earnings),
        totalCalls: host.total_calls,
        totalMinutes: host.total_minutes,
        rating: parseFloat(host.rating),
        pricing: {
          videoCallRate: parseFloat(host.video_call_rate || 150),
          voiceCallRate: parseFloat(host.voice_call_rate || 100),
          messageRate: parseFloat(host.message_rate || 5),
          streamingRate: parseFloat(host.streaming_rate || 50)
        }
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update host profile
app.put('/api/hosts/:hostId/profile', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;
    const { name, phone, age, gender, city, state, bio, languages } = req.body;

    // Verify the requesting user is the host
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Build update query dynamically
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (name) {
      updateFields.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (phone) {
      updateFields.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    if (age) {
      updateFields.push(`age = $${paramCount++}`);
      values.push(age);
    }
    if (gender) {
      updateFields.push(`gender = $${paramCount++}`);
      values.push(gender);
    }
    if (city) {
      updateFields.push(`city = $${paramCount++}`);
      values.push(city);
    }
    if (state) {
      updateFields.push(`state = $${paramCount++}`);
      values.push(state);
    }
    if (bio) {
      updateFields.push(`bio = $${paramCount++}`);
      values.push(bio);
    }
    if (languages) {
      updateFields.push(`languages = $${paramCount++}`);
      values.push(languages);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(hostId);

    const query = `
      UPDATE hosts
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, email, phone, age, gender, city, state, bio, languages, updated_at
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Host not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      host: result.rows[0]
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ==================== HOST PRICING ENDPOINTS ====================

// Get host pricing
app.get('/host/pricing/:hostId', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;

    // Verify the requesting user is the host
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const result = await pool.query(
      'SELECT * FROM host_pricing WHERE host_id = $1',
      [hostId]
    );

    if (result.rows.length === 0) {
      // Create default pricing if not exists
      await pool.query(`
        INSERT INTO host_pricing (host_id, video_call_rate, voice_call_rate, message_rate, streaming_rate)
        VALUES ($1, 150.00, 100.00, 5.00, 50.00)
      `, [hostId]);

      return res.json({
        success: true,
        pricing: {
          host_id: hostId,
          video_call_rate: 150.00,
          voice_call_rate: 100.00,
          message_rate: 5.00,
          streaming_rate: 50.00
        }
      });
    }

    const pricing = result.rows[0];
    res.json({
      success: true,
      pricing: {
        host_id: pricing.host_id,
        video_call_rate: parseFloat(pricing.video_call_rate),
        voice_call_rate: parseFloat(pricing.voice_call_rate),
        message_rate: parseFloat(pricing.message_rate),
        streaming_rate: parseFloat(pricing.streaming_rate),
        updated_at: pricing.updated_at
      }
    });

  } catch (error) {
    console.error('Get pricing error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update host pricing
app.post('/host/pricing/:hostId', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;
    const { video_call_rate, voice_call_rate, message_rate, streaming_rate } = req.body;

    // Verify the requesting user is the host
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const result = await pool.query(`
      INSERT INTO host_pricing (host_id, video_call_rate, voice_call_rate, message_rate, streaming_rate)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (host_id)
      DO UPDATE SET
        video_call_rate = EXCLUDED.video_call_rate,
        voice_call_rate = EXCLUDED.voice_call_rate,
        message_rate = EXCLUDED.message_rate,
        streaming_rate = EXCLUDED.streaming_rate,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [hostId, video_call_rate, voice_call_rate, message_rate, streaming_rate]);

    res.json({
      success: true,
      message: 'Pricing updated successfully',
      pricing: {
        host_id: result.rows[0].host_id,
        video_call_rate: parseFloat(result.rows[0].video_call_rate),
        voice_call_rate: parseFloat(result.rows[0].voice_call_rate),
        message_rate: parseFloat(result.rows[0].message_rate),
        streaming_rate: parseFloat(result.rows[0].streaming_rate),
        updated_at: result.rows[0].updated_at
      }
    });

  } catch (error) {
    console.error('Update pricing error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ==================== EARNINGS ENDPOINTS ====================

// Get earnings summary
app.get('/earnings-summary/:hostId', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;

    // Verify the requesting user is the host
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get total earnings from transactions
    const earningsResult = await pool.query(`
      SELECT
        COALESCE(SUM(amount), 0) as total_earnings,
        COUNT(*) as total_transactions
      FROM transactions
      WHERE host_id = $1 AND status = 'completed'
    `, [hostId]);

    // Get today's earnings
    const todayResult = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as today_earnings
      FROM transactions
      WHERE host_id = $1
        AND status = 'completed'
        AND DATE(created_at) = CURRENT_DATE
    `, [hostId]);

    // Get this week's earnings
    const weekResult = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as week_earnings
      FROM transactions
      WHERE host_id = $1
        AND status = 'completed'
        AND created_at >= DATE_TRUNC('week', CURRENT_DATE)
    `, [hostId]);

    // Get this month's earnings
    const monthResult = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as month_earnings
      FROM transactions
      WHERE host_id = $1
        AND status = 'completed'
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `, [hostId]);

    const earnings = earningsResult.rows[0];
    const today = todayResult.rows[0];
    const week = weekResult.rows[0];
    const month = monthResult.rows[0];

    res.json({
      total_earnings: parseFloat(earnings.total_earnings),
      today_earnings: parseFloat(today.today_earnings),
      week_earnings: parseFloat(week.week_earnings),
      month_earnings: parseFloat(month.month_earnings),
      total_transactions: parseInt(earnings.total_transactions)
    });

  } catch (error) {
    console.error('Earnings summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get transactions history
app.get('/transactions/:hostId', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;
    const { page = 1, limit = 20, type } = req.query;

    // Verify the requesting user is the host
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE t.host_id = $1';
    const queryParams = [hostId];

    if (type) {
      whereClause += ' AND t.transaction_type = $2';
      queryParams.push(type);
    }

    const query = `
      SELECT
        t.*,
        CASE
          WHEN t.transaction_type = 'call' THEN cs.customer_name
          WHEN t.transaction_type = 'message' THEN m.customer_name
          ELSE 'System'
        END as customer_name,
        CASE
          WHEN t.transaction_type = 'call' THEN cs.duration_minutes
          WHEN t.transaction_type = 'streaming' THEN ss.duration_minutes
          ELSE 0
        END as duration_minutes
      FROM transactions t
      LEFT JOIN call_sessions cs ON t.transaction_type = 'call' AND t.reference_id = cs.id
      LEFT JOIN streaming_sessions ss ON t.transaction_type = 'streaming' AND t.reference_id = ss.id
      LEFT JOIN messages m ON t.transaction_type = 'message' AND t.reference_id = m.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    const transactions = result.rows.map(row => ({
      id: row.id,
      type: row.transaction_type,
      amount: parseFloat(row.amount),
      customer_name: row.customer_name || 'Unknown',
      duration: row.duration_minutes || 0,
      description: row.description,
      status: row.status,
      timestamp: row.created_at
    }));

    res.json(transactions);

  } catch (error) {
    console.error('Transactions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get pending call requests
app.get('/call-requests/:hostId/pending', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;

    // Verify the requesting user is the host
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const result = await pool.query(`
      SELECT
        id,
        customer_id,
        customer_name,
        call_type,
        rate_per_minute,
        created_at
      FROM call_sessions
      WHERE host_id = $1 AND status = 'pending'
      ORDER BY created_at ASC
    `, [hostId]);

    const pendingCalls = result.rows.map(row => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      callType: row.call_type,
      ratePerMinute: parseFloat(row.rate_per_minute),
      requestTime: row.created_at
    }));

    res.json(pendingCalls);

  } catch (error) {
    console.error('Pending calls error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Initialize database on startup (commented out for now due to schema issues)
// initializeDatabase();

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Friendy Production API server running on http://0.0.0.0:${port}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Production PostgreSQL' : 'Local PostgreSQL'}`);
  console.log(`🔐 JWT Secret: ${JWT_SECRET.substring(0, 10)}...`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  console.log('✅ Production server ready!');
});

module.exports = { app, pool, upload, authenticateToken, JWT_SECRET };
