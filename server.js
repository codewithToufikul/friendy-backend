const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;

// CORS configuration for Flutter web - Allow all origins for development
const corsOptions = {
  origin: true,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// PostgreSQL connection - Updated to correct NeonDB
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_KMEw48xPIDzS@ep-fancy-night-admnjeut-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize database tables
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255),
        provider VARCHAR(50) DEFAULT 'email',
        provider_id VARCHAR(255),
        photo_url TEXT,
        age INTEGER,
        bio TEXT,
        location VARCHAR(255),
        profile_images TEXT[],
        interests TEXT[],
        gender VARCHAR(20),
        looking_for VARCHAR(20),
        coins INTEGER DEFAULT 50,
        is_premium BOOLEAN DEFAULT FALSE,
        role VARCHAR(20) DEFAULT 'customer',
        is_approved BOOLEAN DEFAULT false,
        approval_status VARCHAR(50) DEFAULT 'pending',
        profile_completed BOOLEAN DEFAULT false,
        -- Host-specific fields
        phone VARCHAR(20),
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100) DEFAULT 'India',
        languages TEXT[], -- Array of languages
        profile_photo_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add missing columns if they don't exist
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'pending'`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(100)`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India'`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS languages TEXT[]`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT`);
    } catch (error) {
      console.log('Columns already exist or error adding them:', error.message);
    }

    // Create hosts table for host app
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hosts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        age INTEGER NOT NULL CHECK (age >= 18 AND age <= 65),
        gender VARCHAR(10) NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
        city VARCHAR(100) NOT NULL,
        bio TEXT NOT NULL,
        profile_image TEXT DEFAULT '',
        is_online BOOLEAN DEFAULT FALSE,
        is_verified BOOLEAN DEFAULT FALSE,
        earnings DECIMAL(10,2) DEFAULT 0.00,
        rating DECIMAL(3,2) DEFAULT 0.00,
        total_calls INTEGER DEFAULT 0,
        total_minutes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE,
        min_age INTEGER DEFAULT 18,
        max_age INTEGER DEFAULT 99,
        max_distance INTEGER DEFAULT 50,
        show_me VARCHAR(20) DEFAULT 'everyone',
        notifications_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create conversations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        participant1_id VARCHAR(255) NOT NULL,
        participant2_id VARCHAR(255) NOT NULL,
        last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id VARCHAR(255) NOT NULL,
        receiver_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        message_type VARCHAR(20) DEFAULT 'text',
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create message_media table for file attachments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_media (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        file_url VARCHAR(500) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size INTEGER,
        thumbnail_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create message_reactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        reaction VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(message_id, user_id)
      );
    `);

    // Create indexes for better performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_participant1 ON conversations(participant1_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_participant2 ON conversations(participant2_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);`);

    // Create coin_transactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coin_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        amount INTEGER NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        description TEXT,
        package_id VARCHAR(50),
        payment_method VARCHAR(50),
        payment_id VARCHAR(100),
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create coin_packages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coin_packages (
        id VARCHAR(50) PRIMARY KEY,
        coins INTEGER NOT NULL,
        bonus_coins INTEGER DEFAULT 0,
        price_inr DECIMAL(10,2) NOT NULL,
        price_usd DECIMAL(10,2) NOT NULL,
        is_popular BOOLEAN DEFAULT FALSE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create streaming sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS streaming_sessions (
        id SERIAL PRIMARY KEY,
        host_id VARCHAR(255) NOT NULL,
        channel_name VARCHAR(255) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        duration_minutes INTEGER DEFAULT 0,
        viewer_count INTEGER DEFAULT 0,
        total_viewers INTEGER DEFAULT 0,
        earnings DECIMAL(10,2) DEFAULT 0,
        total_earnings DECIMAL(10,2) DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'INR',
        status VARCHAR(20) DEFAULT 'live',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create host bank accounts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS host_bank_accounts (
        id SERIAL PRIMARY KEY,
        host_id VARCHAR(255) UNIQUE NOT NULL,
        account_holder_name VARCHAR(255) NOT NULL,
        account_number VARCHAR(50) NOT NULL,
        ifsc_code VARCHAR(20) NOT NULL,
        bank_name VARCHAR(255) NOT NULL,
        branch_name VARCHAR(255) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create withdrawal requests table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_requests (
        id SERIAL PRIMARY KEY,
        host_id VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        bank_account JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        admin_notes TEXT,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create host pricing table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS host_pricing (
        id SERIAL PRIMARY KEY,
        host_id VARCHAR(255) UNIQUE NOT NULL,
        video_call_rate DECIMAL(10,2) NOT NULL DEFAULT 50.00,
        voice_call_rate DECIMAL(10,2) NOT NULL DEFAULT 30.00,
        message_rate DECIMAL(10,2) NOT NULL DEFAULT 5.00,
        streaming_rate DECIMAL(10,2) NOT NULL DEFAULT 10.00,
        currency VARCHAR(10) DEFAULT 'INR',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create call sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS call_sessions (
        id SERIAL PRIMARY KEY,
        host_id VARCHAR(255) NOT NULL,
        customer_id VARCHAR(255) NOT NULL,
        call_type VARCHAR(20) NOT NULL,
        duration_seconds INTEGER NOT NULL,
        rate_per_minute DECIMAL(10,2) NOT NULL,
        total_cost DECIMAL(10,2) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create transactions table for host app
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(255) PRIMARY KEY,
        host_id VARCHAR(255) NOT NULL,
        customer_id VARCHAR(255) NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        duration INTEGER DEFAULT 0,
        rate DECIMAL(10,2) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'completed',
        description TEXT
      );
    `);

    // Create call requests table for host app
    await pool.query(`
      CREATE TABLE IF NOT EXISTS call_requests (
        id VARCHAR(255) PRIMARY KEY,
        host_id VARCHAR(255) NOT NULL,
        customer_id VARCHAR(255) NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        rate DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create message billing table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_billing (
        id SERIAL PRIMARY KEY,
        host_id VARCHAR(255) NOT NULL,
        customer_id VARCHAR(255) NOT NULL,
        cost DECIMAL(10,2) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default coin packages
    await pool.query(`
      INSERT INTO coin_packages (id, coins, bonus_coins, price_inr, price_usd, is_popular, description)
      VALUES
        ('starter', 100, 0, 79.00, 0.99, false, 'Perfect for trying out features'),
        ('popular', 500, 50, 399.00, 4.99, true, 'Most popular choice'),
        ('value', 1000, 150, 799.00, 9.99, false, 'Great value for money'),
        ('premium', 2500, 500, 1599.00, 19.99, false, 'Maximum coins and bonus')
      ON CONFLICT (id) DO UPDATE SET
        coins = EXCLUDED.coins,
        bonus_coins = EXCLUDED.bonus_coins,
        price_inr = EXCLUDED.price_inr,
        price_usd = EXCLUDED.price_usd,
        is_popular = EXCLUDED.is_popular,
        description = EXCLUDED.description;
    `);

    // Add role column if it doesn't exist (migration)
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'customer';
    `);

    // Insert demo host data
    const hashedPassword = await bcrypt.hash('secret123', 10);
    await pool.query(`
      INSERT INTO hosts (name, email, password_hash, phone, age, gender, city, bio, is_verified, earnings, rating)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (email) DO NOTHING
    `, [
      'Demo Host',
      'demo@host.com',
      hashedPassword,
      '+91-9876543210',
      25,
      'Female',
      'Mumbai',
      'Hi! I am a friendly host ready to chat with you. I love talking about movies, music, and life in general.',
      true,
      1500.00,
      4.5
    ]);

    console.log('✅ Database initialized successfully!');
    console.log('🔑 Demo Host Account: demo@host.com / password: secret123');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Friendy API is running!' });
});

// Social authentication endpoint
app.post('/auth/social', async (req, res) => {
  try {
    console.log('Social auth request body:', req.body);
    const { email, name, provider, provider_id, photo_url, role } = req.body;

    if (!email || !name || !provider || !provider_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    let user;
    if (existingUser.rows.length > 0) {
      // User exists, update their info
      user = existingUser.rows[0];
      await pool.query(
        `UPDATE users SET
         name = $1,
         profile_images = CASE
           WHEN profile_images IS NULL OR profile_images = '[]'
           THEN $2::jsonb
           ELSE profile_images
         END,
         updated_at = CURRENT_TIMESTAMP
         WHERE email = $3`,
        [name, JSON.stringify([photo_url]), email]
      );
    } else {
      // Create new user
      const result = await pool.query(
        `INSERT INTO users (email, name, role, age, gender, location, profile_images, coins, is_approved, approval_status, profile_completed, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          email,
          name,
          role || 'host',
          25, // default age
          'Other', // default gender
          'India', // default location
          JSON.stringify([photo_url]),
          role === 'host' ? 0 : 100, // hosts start with 0, customers get 100 free coins
          false, // is_approved
          'pending', // approval_status
          false // profile_completed
        ]
      );
      user = result.rows[0];
    }

    // Check if host needs approval
    const needsApproval = user.role === 'host' && (!user.is_approved || user.approval_status === 'pending');

    res.status(existingUser.rows.length > 0 ? 200 : 201).json({
      success: true,
      message: existingUser.rows.length > 0 ? 'User signed in successfully' : 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        age: user.age,
        gender: user.gender,
        location: user.location,
        profile_images: user.profile_images,
        coins: user.coins,
        created_at: user.created_at,
        is_approved: user.is_approved || false,
        approval_status: user.approval_status || 'pending',
        profile_completed: user.profile_completed || false
      },
      needsApproval: needsApproval,
      requiresProfileCompletion: user.role === 'host' && !user.profile_completed
    });

  } catch (error) {
    console.error('Social auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign up
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name, age, gender, country } = req.body;
    console.log(email, password, name, age, gender, country)
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, age, gender, country, coins, is_approved, approval_status, profile_completed, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [email.toLowerCase(), hashedPassword, name, 'user',age,  gender , country, 0, false, 'pending', false]
    );

    const user = result.rows[0];
    console.log(user)
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        age: user.age,
        gender: user.gender,
        location: user.location,
        coins: user.coins,
        is_approved: user.is_approved,
        approval_status: user.approval_status,
        profile_completed: user.profile_completed,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Sign up error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign in
app.post('/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get user by email
    const result = await pool.query(
      'SELECT id, email, name, password_hash, coins, is_premium, role, created_at FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'No account found with this email' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Return user data (without password)
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        coins: user.coins,
        is_premium: user.is_premium,
        created_at: user.created_at,
      }
    });

  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user data
app.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.age, u.bio, u.location,
              u.profile_images, u.interests, u.gender, u.looking_for,
              u.coins, u.is_premium, u.created_at, u.updated_at,
              up.min_age, up.max_age, up.max_distance, up.show_me, up.notifications_enabled
       FROM users u
       LEFT JOIN user_preferences up ON u.id = up.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const row = result.rows[0];
    const userData = {
      id: row.id,
      email: row.email,
      name: row.name,
      age: row.age,
      bio: row.bio,
      location: row.location,
      profile_images: row.profile_images || [],
      interests: row.interests || [],
      gender: row.gender,
      looking_for: row.looking_for,
      coins: row.coins,
      is_premium: row.is_premium,
      created_at: row.created_at,
      updated_at: row.updated_at,
      preferences: {
        min_age: row.min_age || 18,
        max_age: row.max_age || 99,
        max_distance: row.max_distance || 50,
        show_me: row.show_me || 'everyone',
        notifications_enabled: row.notifications_enabled !== false,
      },
    };

    res.json({ success: true, user: userData });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
app.put('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, age, bio, location, interests, gender, looking_for } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (age !== undefined) {
      updates.push(`age = $${paramCount++}`);
      values.push(age);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramCount++}`);
      values.push(bio);
    }
    if (location !== undefined) {
      updates.push(`location = $${paramCount++}`);
      values.push(location);
    }
    if (interests !== undefined) {
      updates.push(`interests = $${paramCount++}`);
      values.push(interests);
    }
    if (gender !== undefined) {
      updates.push(`gender = $${paramCount++}`);
      values.push(gender);
    }
    if (looking_for !== undefined) {
      updates.push(`looking_for = $${paramCount++}`);
      values.push(looking_for);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    res.json({ success: true, message: 'Profile updated successfully' });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by email
app.get('/users/email/:email', async (req, res) => {
  try {
    const { email } = req.params;

    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.age, u.bio, u.location,
              u.profile_images, u.interests, u.gender, u.looking_for,
              u.coins, u.is_premium, u.created_at, u.updated_at,
              u.provider, u.provider_id, u.photo_url
       FROM users u
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({ success: true, user });

  } catch (error) {
    console.error('Get user by email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Duplicate endpoint removed - using the first one above

// Get all users (for testing)
app.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, coins, provider, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      users: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Coin Management APIs

// Get coin packages
app.get('/coins/packages', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM coin_packages ORDER BY price_inr ASC'
    );

    res.json({
      success: true,
      packages: result.rows
    });

  } catch (error) {
    console.error('Get coin packages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Purchase coins
app.post('/coins/purchase', async (req, res) => {
  try {
    const { userId, packageId, paymentMethod, paymentId } = req.body;

    // Validate input
    if (!userId || !packageId || !paymentMethod) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get package details
    const packageResult = await pool.query(
      'SELECT * FROM coin_packages WHERE id = $1',
      [packageId]
    );

    if (packageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Package not found' });
    }

    const package = packageResult.rows[0];
    const totalCoins = package.coins + package.bonus_coins;

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update user coins
      const updateResult = await client.query(
        'UPDATE users SET coins = coins + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING coins',
        [totalCoins, userId]
      );

      if (updateResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const newBalance = updateResult.rows[0].coins;

      // Record transaction
      await client.query(
        `INSERT INTO coin_transactions
         (user_id, amount, transaction_type, description, package_id, payment_method, payment_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          totalCoins,
          'purchase',
          `Purchased ${package.coins} coins + ${package.bonus_coins} bonus`,
          packageId,
          paymentMethod,
          paymentId || `demo_${Date.now()}`,
          'completed'
        ]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        transaction: {
          coins_purchased: package.coins,
          bonus_coins: package.bonus_coins,
          total_coins: totalCoins,
          new_balance: newBalance,
          amount_paid: package.price_inr,
          currency: 'INR'
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Purchase coins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Spend coins
app.post('/coins/spend', async (req, res) => {
  try {
    const { userId, amount, type, description } = req.body;

    // Validate input
    if (!userId || !amount || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check current balance
      const balanceResult = await client.query(
        'SELECT coins FROM users WHERE id = $1',
        [userId]
      );

      if (balanceResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const currentBalance = balanceResult.rows[0].coins;

      if (currentBalance < amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient coins' });
      }

      // Update user coins
      const updateResult = await client.query(
        'UPDATE users SET coins = coins - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING coins',
        [amount, userId]
      );

      const newBalance = updateResult.rows[0].coins;

      // Record transaction
      await client.query(
        `INSERT INTO coin_transactions
         (user_id, amount, transaction_type, description, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, -amount, type, description, 'completed']
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        transaction: {
          coins_spent: amount,
          new_balance: newBalance,
          type: type,
          description: description
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Spend coins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user coin balance
app.get('/coins/balance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      'SELECT coins FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      balance: result.rows[0].coins
    });

  } catch (error) {
    console.error('Get coin balance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transaction history
app.get('/coins/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT ct.*, cp.coins as package_coins, cp.bonus_coins, cp.price_inr
       FROM coin_transactions ct
       LEFT JOIN coin_packages cp ON ct.package_id = cp.id
       WHERE ct.user_id = $1
       ORDER BY ct.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({
      success: true,
      transactions: result.rows
    });

  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Friendy API is running' });
});

// Create demo users endpoint
app.post('/create-demo-users', async (req, res) => {
  try {
    const saltRounds = 10;

    // Demo customer user
    const customerPassword = await bcrypt.hash('demo123', saltRounds);
    await pool.query(
      `INSERT INTO users (email, name, password_hash, age, gender, coins, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO NOTHING`,
      ['demo@friendy.com', 'Demo Customer', customerPassword, 25, 'Female', 100, 'customer']
    );

    // Demo host user
    const hostPassword = await bcrypt.hash('host123', saltRounds);
    await pool.query(
      `INSERT INTO users (email, name, password_hash, age, gender, coins, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO NOTHING`,
      ['host@friendy.com', 'Demo Host', hostPassword, 28, 'Male', 200, 'host']
    );

    res.json({ success: true, message: 'Demo users created successfully' });
  } catch (error) {
    console.error('Error creating demo users:', error);
    res.status(500).json({ error: 'Failed to create demo users' });
  }
});

// Host-specific endpoints

// Update host status (online/live)
app.put('/api/hosts/:hostId/status', async (req, res) => {
  try {
    const { hostId } = req.params;
    const { isOnline, isLive } = req.body;

    await pool.query(
      'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND role = $2',
      [hostId, 'host']
    );

    res.json({
      success: true,
      message: 'Host status updated',
      status: { isOnline, isLive }
    });

  } catch (error) {
    console.error('Update host status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get host call requests
app.get('/api/hosts/:hostId/call-requests', async (req, res) => {
  try {
    const { hostId } = req.params;

    // Mock call requests for demo
    const mockRequests = [
      {
        id: 'req_1',
        customer_name: 'Sarah Johnson',
        customer_id: 'cust_1',
        call_type: 'video',
        duration_minutes: 15,
        rate_per_minute: 50,
        status: 'pending',
        created_at: new Date().toISOString()
      },
      {
        id: 'req_2',
        customer_name: 'Emma Wilson',
        customer_id: 'cust_2',
        call_type: 'audio',
        duration_minutes: 10,
        rate_per_minute: 30,
        status: 'pending',
        created_at: new Date().toISOString()
      }
    ];

    res.json({
      success: true,
      call_requests: mockRequests
    });

  } catch (error) {
    console.error('Get call requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept call request
app.post('/api/hosts/:hostId/call-requests/:requestId/accept', async (req, res) => {
  try {
    const { hostId, requestId } = req.params;

    res.json({
      success: true,
      message: 'Call request accepted',
      call_session: {
        id: `session_${Date.now()}`,
        host_id: hostId,
        request_id: requestId,
        status: 'active',
        started_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Accept call request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject call request
app.post('/api/hosts/:hostId/call-requests/:requestId/reject', async (req, res) => {
  try {
    const { hostId, requestId } = req.params;

    res.json({
      success: true,
      message: 'Call request rejected'
    });

  } catch (error) {
    console.error('Reject call request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Complete call
app.post('/api/hosts/:hostId/calls/:callId/complete', async (req, res) => {
  try {
    const { hostId, callId } = req.params;
    const { duration, earnings } = req.body;

    res.json({
      success: true,
      message: 'Call completed',
      call_summary: {
        id: callId,
        duration_minutes: duration,
        earnings: earnings,
        completed_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Complete call error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get host earnings
app.get('/api/hosts/:hostId/earnings', async (req, res) => {
  try {
    const { hostId } = req.params;

    // Mock earnings data for demo
    const mockEarnings = {
      total_earnings: 2500.00,
      gross_earnings: 3000.00,
      total_commission: 500.00,
      total_transactions: 45,
      recent_earnings: [
        {
          type: 'video_call',
          gross_amount: 150.00,
          commission: 25.00,
          net_amount: 125.00,
          earned_at: new Date().toISOString()
        },
        {
          type: 'audio_call',
          gross_amount: 90.00,
          commission: 15.00,
          net_amount: 75.00,
          earned_at: new Date(Date.now() - 86400000).toISOString()
        }
      ]
    };

    res.json({
      success: true,
      ...mockEarnings
    });

  } catch (error) {
    console.error('Get host earnings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get host statistics
app.get('/api/hosts/:hostId/stats', async (req, res) => {
  try {
    const { hostId } = req.params;

    // Mock stats data for demo
    const mockStats = {
      total_earnings: 2500,
      total_minutes: 1200,
      rating: 4.8,
      total_reviews: 156,
      total_calls: 89,
      total_messages: 234,
      total_streams: 12,
      avg_viewers: 45
    };

    res.json({
      success: true,
      ...mockStats
    });

  } catch (error) {
    console.error('Get host stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update host pricing
app.put('/api/hosts/:hostId/pricing', async (req, res) => {
  try {
    const { hostId } = req.params;
    const { audio_call_rate, video_call_rate, message_rate } = req.body;

    res.json({
      success: true,
      message: 'Pricing updated successfully',
      pricing: {
        audio_call_rate,
        video_call_rate,
        message_rate
      }
    });

  } catch (error) {
    console.error('Update host pricing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all hosts with their pricing (alias to avoid collision with '/api/hosts/:hostId')
app.get('/api/hosts-list/pricing', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT h.id, h.name, h.age, h.gender, h.location, h.bio, h.profile_image, h.status,
              hp.video_call_rate, hp.voice_call_rate, hp.message_rate, hp.streaming_rate, hp.currency
       FROM hosts h
       LEFT JOIN host_pricing hp ON h.id = hp.host_id
       WHERE h.status = 'approved'
       ORDER BY h.created_at DESC`
    );
    console.log("result host",result)
    res.json({
      hosts: result.rows
    });
  } catch (error) {
    console.error('Get hosts with pricing (alias) error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get host profile
app.get('/api/hosts/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query(
      `SELECT u.id, u.name, u.location, u.age, u.bio, u.profile_images,
              u.coins, u.created_at
       FROM users u
       WHERE u.id = $1 AND u.role = $2`,
      [hostId, 'host']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Host not found' });
    }

    const host = result.rows[0];
    res.json({
      success: true,
      id: host.id,
      name: host.name,
      location: host.location,
      age: host.age,
      bio: host.bio,
      profile_images: host.profile_images || [],
      rating: 4.8,
      total_reviews: 156,
      is_online: true,
      is_live: false,
      pricing: {
        audio_call_rate: 30,
        video_call_rate: 50,
        message_rate: 10
      }
    });

  } catch (error) {
    console.error('Get host profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload host media
app.post('/api/hosts/:hostId/media', async (req, res) => {
  try {
    const { hostId } = req.params;
    const { media_url, media_type, is_primary } = req.body;

    res.status(201).json({
      success: true,
      message: 'Media uploaded successfully',
      media: {
        id: `media_${Date.now()}`,
        url: media_url,
        type: media_type,
        is_primary: is_primary,
        uploaded_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Upload host media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Streaming session routes
app.post('/api/streaming/session', async (req, res) => {
  try {
    const { host_id, channel_name, start_time, status, viewer_count, earnings, currency } = req.body;

    const result = await pool.query(
      `INSERT INTO streaming_sessions (host_id, channel_name, start_time, status, viewer_count, earnings, currency, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [host_id, channel_name, start_time, status, viewer_count || 0, earnings || 0, currency || 'INR']
    );

    res.status(201).json({
      message: 'Streaming session created',
      session: result.rows[0]
    });
  } catch (error) {
    console.error('Create streaming session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/streaming/session', async (req, res) => {
  try {
    const { host_id, channel_name, end_time, duration_minutes, total_viewers, total_earnings, status } = req.body;

    const result = await pool.query(
      `UPDATE streaming_sessions
       SET end_time = $1, duration_minutes = $2, total_viewers = $3, total_earnings = $4, status = $5, updated_at = NOW()
       WHERE host_id = $6 AND channel_name = $7 AND status = 'live'
       RETURNING *`,
      [end_time, duration_minutes, total_viewers, total_earnings, status, host_id, channel_name]
    );

    res.json({
      message: 'Streaming session updated',
      session: result.rows[0]
    });
  } catch (error) {
    console.error('Update streaming session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/streaming/history/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query(
      `SELECT * FROM streaming_sessions
       WHERE host_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [hostId]
    );

    res.json({
      sessions: result.rows
    });
  } catch (error) {
    console.error('Get streaming history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Host earnings routes
app.put('/api/host/earnings/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    const { earnings, currency, timestamp } = req.body;

    // Update host earnings
    await pool.query(
      `UPDATE hosts
       SET earnings = earnings + $1, updated_at = NOW()
       WHERE id = $2`,
      [earnings, hostId]
    );

    res.json({
      message: 'Host earnings updated successfully'
    });
  } catch (error) {
    console.error('Update host earnings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/host/earnings/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;

    const hostResult = await pool.query(
      'SELECT earnings FROM hosts WHERE id = $1',
      [hostId]
    );

    const streamingResult = await pool.query(
      `SELECT
         SUM(total_earnings) as total_earnings,
         SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN total_earnings ELSE 0 END) as today_earnings,
         SUM(CASE WHEN created_at >= DATE_TRUNC('week', CURRENT_DATE) THEN total_earnings ELSE 0 END) as weekly_earnings,
         SUM(CASE WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN total_earnings ELSE 0 END) as monthly_earnings
       FROM streaming_sessions
       WHERE host_id = $1 AND status = 'completed'`,
      [hostId]
    );

    const earnings = streamingResult.rows[0];

    res.json({
      total_earnings: parseFloat(earnings.total_earnings || 0),
      today_earnings: parseFloat(earnings.today_earnings || 0),
      weekly_earnings: parseFloat(earnings.weekly_earnings || 0),
      monthly_earnings: parseFloat(earnings.monthly_earnings || 0),
      currency: 'INR'
    });
  } catch (error) {
    console.error('Get host earnings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bank account routes
app.post('/api/host/bank-account/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    const { account_holder_name, account_number, ifsc_code, bank_name, branch_name, currency } = req.body;

    const result = await pool.query(
      `INSERT INTO host_bank_accounts (host_id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, currency, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (host_id) DO UPDATE SET
         account_holder_name = EXCLUDED.account_holder_name,
         account_number = EXCLUDED.account_number,
         ifsc_code = EXCLUDED.ifsc_code,
         bank_name = EXCLUDED.bank_name,
         branch_name = EXCLUDED.branch_name,
         currency = EXCLUDED.currency,
         updated_at = NOW()
       RETURNING *`,
      [hostId, account_holder_name, account_number, ifsc_code, bank_name, branch_name, currency || 'INR']
    );

    res.status(201).json({
      message: 'Bank account details saved successfully',
      bank_account: result.rows[0]
    });
  } catch (error) {
    console.error('Save bank account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/host/bank-account/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query(
      'SELECT * FROM host_bank_accounts WHERE host_id = $1',
      [hostId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bank account not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get bank account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Withdrawal request routes
app.post('/api/withdrawal/request', async (req, res) => {
  try {
    const { host_id, amount, currency, bank_account, status } = req.body;

    const result = await pool.query(
      `INSERT INTO withdrawal_requests (host_id, amount, currency, bank_account, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [host_id, amount, currency || 'INR', JSON.stringify(bank_account), status || 'pending']
    );

    res.status(201).json({
      message: 'Withdrawal request created successfully',
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Create withdrawal request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/withdrawal/requests', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT wr.*, h.name as host_name, h.email as host_email
       FROM withdrawal_requests wr
       JOIN hosts h ON wr.host_id = h.id
       ORDER BY wr.created_at DESC`
    );

    res.json({
      requests: result.rows
    });
  } catch (error) {
    console.error('Get withdrawal requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/withdrawal/request/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes, processed_at } = req.body;

    const result = await pool.query(
      `UPDATE withdrawal_requests
       SET status = $1, admin_notes = $2, processed_at = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, admin_notes, processed_at, id]
    );

    res.json({
      message: 'Withdrawal request updated successfully',
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Update withdrawal request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Host pricing routes
app.post('/api/host/pricing/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    const { video_call_rate, voice_call_rate, message_rate, streaming_rate, currency } = req.body;

    const result = await pool.query(
      `INSERT INTO host_pricing (host_id, video_call_rate, voice_call_rate, message_rate, streaming_rate, currency, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (host_id) DO UPDATE SET
         video_call_rate = EXCLUDED.video_call_rate,
         voice_call_rate = EXCLUDED.voice_call_rate,
         message_rate = EXCLUDED.message_rate,
         streaming_rate = EXCLUDED.streaming_rate,
         currency = EXCLUDED.currency,
         updated_at = NOW()
       RETURNING *`,
      [hostId, video_call_rate, voice_call_rate, message_rate, streaming_rate, currency || 'INR']
    );

    res.status(201).json({
      message: 'Host pricing saved successfully',
      pricing: result.rows[0]
    });
  } catch (error) {
    console.error('Save host pricing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/host/pricing/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query(
      'SELECT * FROM host_pricing WHERE host_id = $1',
      [hostId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Host pricing not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get host pricing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all hosts with their pricing (for customer app)
app.get('/api/hosts/pricing', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT h.id, h.name, h.age, h.gender, h.location, h.bio, h.profile_image, h.status,
              hp.video_call_rate, hp.voice_call_rate, hp.message_rate, hp.streaming_rate, hp.currency
       FROM hosts h
       LEFT JOIN host_pricing hp ON h.id = hp.host_id
       WHERE h.status = 'approved'
       ORDER BY h.created_at DESC`
    );
    res.json({
      hosts: result.rows
    });
  } catch (error) {
    console.error('Get hosts with pricing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Agora service endpoints

// Update streaming earnings
app.put('/api/streaming/earnings/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    const { earnings, duration_seconds, end_time } = req.body;

    const result = await pool.query(
      `UPDATE streaming_sessions
       SET earnings = $1, duration_seconds = $2, end_time = $3, status = 'completed'
       WHERE host_id = $4 AND status = 'active'
       RETURNING *`,
      [earnings, duration_seconds, end_time, hostId]
    );

    res.json({
      message: 'Streaming earnings updated successfully',
      session: result.rows[0]
    });
  } catch (error) {
    console.error('Update streaming earnings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save call session
app.post('/api/call/session', async (req, res) => {
  try {
    const { host_id, customer_id, call_type, duration_seconds, rate_per_minute, total_cost, start_time, end_time } = req.body;

    const result = await pool.query(
      `INSERT INTO call_sessions (host_id, customer_id, call_type, duration_seconds, rate_per_minute, total_cost, start_time, end_time, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [host_id, customer_id, call_type, duration_seconds, rate_per_minute, total_cost, start_time, end_time]
    );

    res.status(201).json({
      message: 'Call session saved successfully',
      session: result.rows[0]
    });
  } catch (error) {
    console.error('Save call session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save message billing
app.post('/api/message/billing', async (req, res) => {
  try {
    const { host_id, customer_id, cost, timestamp } = req.body;

    const result = await pool.query(
      `INSERT INTO message_billing (host_id, customer_id, cost, timestamp, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [host_id, customer_id, cost, timestamp]
    );

    res.status(201).json({
      message: 'Message billing saved successfully',
      billing: result.rows[0]
    });
  } catch (error) {
    console.error('Save message billing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== CALL REQUESTS (SIGNALING) ====================

// Send call request
app.post('/api/call-requests', async (req, res) => {
  try {
    const { customer_id, host_id, call_type, price_per_minute, message } = req.body;

    console.log('📞 Creating call request:', { customer_id, host_id, call_type, price_per_minute });

    const result = await pool.query(
      `INSERT INTO call_requests (
         customer_id, host_id, call_type, price_per_minute, message, status, created_at
       ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       RETURNING *`,
      [customer_id, host_id, call_type || 'voice', price_per_minute, message || 'Call request']
    );

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

// Get call requests for a host (pending)
app.get('/api/hosts/:hostId/call-requests', async (req, res) => {
  try {
    const { hostId } = req.params;
    const result = await pool.query(
      `SELECT cr.*
       FROM call_requests cr
       WHERE cr.host_id = $1 AND cr.status = 'pending'
       ORDER BY cr.created_at DESC`,
      [hostId]
    );

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

    const generatedChannelName = channel_name || `call_${host_id || 'host'}_${Date.now()}`;

    const result = await pool.query(
      `UPDATE call_requests
       SET status = 'accepted', channel_name = $1, accepted_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [generatedChannelName, requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Call request not found or already processed'
      });
    }

    res.json({
      success: true,
      message: 'Call request accepted',
      channel_name: generatedChannelName,
      agora_app_id: process.env.AGORA_APP_ID || null,
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Accept call error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept call' });
  }
});

// Get call request status
app.get('/api/call-requests/:requestId/status', async (req, res) => {
  try {
    const { requestId } = req.params;

    const result = await pool.query(
      `SELECT * FROM call_requests WHERE id = $1`,
      [requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Call request not found' });
    }

    res.json({ success: true, request: result.rows[0] });
  } catch (error) {
    console.error('Get call request status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get call request status' });
  }
});

// Host Registration Endpoint
app.post('/auth/host/register', async (req, res) => {
  try {
    console.log('📝 Registration request received:', req.body);

    const {
      name,
      email,
      password,
      phone,
      age,
      gender,
      city,
      bio,
      profileImage
    } = req.body;

    console.log('📋 Extracted fields:', {
      name: !!name,
      email: !!email,
      password: !!password,
      phone: !!phone,
      age: !!age,
      gender: !!gender,
      city: !!city,
      bio: !!bio,
      profileImage: !!profileImage
    });

    // Validate required fields
    if (!name || !email || !password || !phone || !age || !gender || !city || !bio) {
      console.log('❌ Validation failed - missing fields');
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Validate age
    if (age < 18 || age > 65) {
      return res.status(400).json({ error: 'Age must be between 18 and 65' });
    }

    // Check if host already exists
    const existingHost = await pool.query('SELECT * FROM hosts WHERE email = $1', [email.toLowerCase()]);
    if (existingHost.rows.length > 0) {
      console.log('❌ Host already exists:', email);
      return res.status(400).json({ error: 'Host with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new host user
    const result = await pool.query(
      `INSERT INTO hosts (
        name, email, password_hash, phone, age, gender, city, bio, profile_image, is_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, email, phone, age, gender, city, bio, profile_image, is_verified, earnings, rating, created_at`,
      [
        name,
        email.toLowerCase(),
        hashedPassword,
        phone,
        age,
        gender,
        city,
        bio,
        profileImage || '',
        false // not verified initially
      ]
    );

    const host = result.rows[0];

    console.log('✅ Host registered successfully:', email);

    res.status(201).json({
      success: true,
      message: 'Host registration successful!',
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
        earnings: parseFloat(host.earnings || 0),
        rating: parseFloat(host.rating || 0),
        created_at: host.created_at
      }
    });
  } catch (error) {
    console.error('❌ Host registration error:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Email/Password Sign Up (General)


// Host Login Endpoint
app.post('/auth/host/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find host user in hosts table
    const result = await pool.query('SELECT * FROM hosts WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const host = result.rows[0];

    // Check password
    const isValidPassword = await bcrypt.compare(password, host.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await pool.query(
      'UPDATE hosts SET last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [host.id]
    );

    console.log('✅ Host login successful:', email);

    res.json({
      success: true,
      message: 'Host sign in successful',
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
        is_online: host.is_online,
        is_verified: host.is_verified,
        earnings: parseFloat(host.earnings || 0),
        rating: parseFloat(host.rating || 0),
        total_calls: host.total_calls || 0,
        total_minutes: host.total_minutes || 0,
        created_at: host.created_at,
        last_login: host.last_login
      }
    });
  } catch (error) {
    console.error('Host sign in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Email/Password Sign In (General)
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash || user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    res.json({
      success: true,
      message: 'Sign in successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        age: user.age,
        gender: user.gender,
        location: user.location,
        coins: user.coins,
        is_approved: user.is_approved,
        approval_status: user.approval_status,
        profile_completed: user.profile_completed,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Sign in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Profile completion endpoint
app.post('/auth/complete-profile', async (req, res) => {
  try {
    const { userId, bio, age, gender, location, profileImages } = req.body;

    if (!userId || !bio || !age || !gender || !location) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await pool.query(
      `UPDATE users SET
       bio = $1,
       age = $2,
       gender = $3,
       location = $4,
       profile_images = $5,
       profile_completed = true,
       approval_status = 'pending',
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND role = 'host'`,
      [bio, age, gender, location, JSON.stringify(profileImages), userId]
    );

    res.json({
      success: true,
      message: 'Profile completed successfully'
    });
  } catch (error) {
    console.error('Profile completion error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check approval status endpoint
app.get('/auth/approval-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      'SELECT id, name, email, role, is_approved, approval_status, profile_completed FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Approval status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin Panel Endpoints
app.get('/admin/dashboard', async (req, res) => {
  try {
    const hostStats = await pool.query(`
      SELECT
        COUNT(*) as total_hosts,
        COUNT(*) FILTER (WHERE NOT is_verified) as pending_hosts,
        COUNT(*) FILTER (WHERE is_verified = true) as approved_hosts
      FROM hosts
    `);

    const customerStats = await pool.query(`
      SELECT COUNT(*) as total_customers FROM users WHERE role = 'customer'
    `);

    const stats = {
      total_hosts: parseInt(hostStats.rows[0].total_hosts),
      pending_hosts: parseInt(hostStats.rows[0].pending_hosts),
      approved_hosts: parseInt(hostStats.rows[0].approved_hosts),
      total_customers: parseInt(customerStats.rows[0].total_customers || 0)
    };

    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/admin/hosts', async (req, res) => {
  try {
    const hosts = await pool.query(`
      SELECT id, name, email, is_verified as is_approved,
             CASE WHEN is_verified THEN 'approved' ELSE 'pending' END as approval_status,
             created_at, updated_at
      FROM hosts
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      hosts: hosts.rows
    });
  } catch (error) {
    console.error('Admin hosts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/admin/host-requests', async (req, res) => {
  try {
    const requests = await pool.query(`
      SELECT id, name, email, profile_image, created_at,
             CASE WHEN bio IS NOT NULL AND bio != '' THEN true ELSE false END as profile_completed
      FROM hosts
      WHERE (is_verified = false OR is_verified IS NULL)
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      requests: requests.rows
    });
  } catch (error) {
    console.error('Admin host requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/admin/approve-host/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;

    await pool.query(`
      UPDATE hosts
      SET is_verified = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [hostId]);

    console.log(`✅ Host ${hostId} approved successfully`);

    res.json({
      success: true,
      message: 'Host approved successfully'
    });
  } catch (error) {
    console.error('Admin approve host error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/admin/reject-host/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;

    // For now, we'll delete rejected hosts, but you could add a 'rejected' status field
    await pool.query(`
      DELETE FROM hosts WHERE id = $1
    `, [hostId]);

    console.log(`❌ Host ${hostId} rejected and removed`);

    res.json({
      success: true,
      message: 'Host rejected successfully'
    });
  } catch (error) {
    console.error('Admin reject host error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Transaction Management Endpoints for Host App

// Create transaction
app.post('/transactions', async (req, res) => {
  try {
    const { id, host_id, customer_id, customer_name, type, amount, duration, rate, timestamp, status, description } = req.body;

    const result = await pool.query(
      `INSERT INTO transactions (id, host_id, customer_id, customer_name, type, amount, duration, rate, timestamp, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [id, host_id, customer_id, customer_name, type, amount, duration || 0, rate, timestamp || new Date(), status || 'completed', description]
    );

    res.status(201).json({
      success: true,
      transaction: result.rows[0]
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent transactions for host
app.get('/transactions/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    const { limit = 10 } = req.query;

    const result = await pool.query(
      `SELECT * FROM transactions
       WHERE host_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [hostId, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Failed to fetch transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get earnings summary for host
app.get('/earnings-summary/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query(
      `SELECT
         SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_earnings,
         COUNT(CASE WHEN type IN ('videoCall', 'voiceCall') THEN 1 END) as total_calls,
         SUM(CASE WHEN type IN ('videoCall', 'voiceCall') THEN duration ELSE 0 END) as total_minutes,
         AVG(CASE WHEN amount > 0 THEN amount ELSE NULL END) as avg_earning
       FROM transactions
       WHERE host_id = $1`,
      [hostId]
    );

    const summary = result.rows[0];
    res.json({
      total_earnings: parseFloat(summary.total_earnings || 0),
      total_calls: parseInt(summary.total_calls || 0),
      total_minutes: parseInt(summary.total_minutes || 0),
      avg_earning: parseFloat(summary.avg_earning || 0)
    });
  } catch (error) {
    console.error('Get earnings summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Call Request Management Endpoints

// Create call request
app.post('/call-requests', async (req, res) => {
  try {
    const { id, host_id, customer_id, customer_name, type, rate, status } = req.body;

    const result = await pool.query(
      `INSERT INTO call_requests (id, host_id, customer_id, customer_name, type, rate, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, host_id, customer_id, customer_name, type, rate, status || 'pending']
    );

    res.status(201).json({
      success: true,
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Create call request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pending call requests for host
app.get('/call-requests/:hostId/pending', async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query(
      `SELECT * FROM call_requests
       WHERE host_id = $1 AND status = 'pending'
       ORDER BY created_at DESC`,
      [hostId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get pending call requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update call request status
app.put('/call-requests/:requestId/status', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;

    const result = await pool.query(
      `UPDATE call_requests
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call request not found' });
    }

    res.json({
      success: true,
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Update call request status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Agora Configuration
const AGORA_APP_ID = process.env.AGORA_APP_ID || 'your_agora_app_id';
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || 'your_agora_app_certificate';

// Generate Agora token
function generateAgoraToken(channelName, uid, role, privilegeExpiredTs) {
  const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
  
  return RtcTokenBuilder.buildTokenWithUid(
    AGORA_APP_ID,
    AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    role,
    privilegeExpiredTs
  );
}

// Agora Token Generation Endpoint
app.get('/agora/token/:channelName/:uid', (req, res) => {
  try {
    const { channelName, uid } = req.params;
    const { role = 'publisher', expireTime = 3600 } = req.query;

    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + parseInt(expireTime);

    const token = generateAgoraToken(
      channelName,
      parseInt(uid),
      role === 'publisher' ? 1 : 2, // 1 for publisher, 2 for subscriber
      privilegeExpiredTs
    );

    res.json({
      success: true,
      token: token,
      appId: AGORA_APP_ID,
      channelName: channelName,
      uid: parseInt(uid),
      expireTime: parseInt(expireTime)
    });
  } catch (error) {
    console.error('❌ Agora token generation error:', error);
    res.status(500).json({ error: 'Failed to generate Agora token' });
  }
});

// Agora Call Session Management
app.post('/agora/start-call', async (req, res) => {
  try {
    const { hostId, customerId, callType, rate } = req.body;

    // Generate unique channel name
    const channelName = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Generate tokens for both participants
    const hostToken = generateAgoraToken(channelName, hostId, 1, Math.floor(Date.now() / 1000) + 3600);
    const customerToken = generateAgoraToken(channelName, customerId, 2, Math.floor(Date.now() / 1000) + 3600);

    // Store call session in database
    const callSession = {
      id: uuidv4(),
      channel_name: channelName,
      host_id: hostId,
      customer_id: customerId,
      call_type: callType,
      rate: rate,
      start_time: new Date(),
      status: 'active'
    };

    await pool.query(
      `INSERT INTO call_sessions (id, channel_name, host_id, customer_id, call_type, rate, start_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [callSession.id, callSession.channel_name, callSession.host_id, callSession.customer_id, 
       callSession.call_type, callSession.rate, callSession.start_time, callSession.status]
    );

    res.json({
      success: true,
      callSession: {
        channelName: channelName,
        hostToken: hostToken,
        customerToken: customerToken,
        appId: AGORA_APP_ID,
        sessionId: callSession.id
      }
    });
  } catch (error) {
    console.error('❌ Start call error:', error);
    res.status(500).json({ error: 'Failed to start call' });
  }
});

app.post('/agora/end-call/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { duration, amount } = req.body;

    // Update call session
    const result = await pool.query(
      `UPDATE call_sessions
       SET end_time = CURRENT_TIMESTAMP, duration = $1, status = 'completed'
       WHERE id = $2
       RETURNING *`,
      [duration, sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call session not found' });
    }

    const session = result.rows[0];

    // Create transaction record
    const transactionId = uuidv4();
    await pool.query(
      `INSERT INTO transactions (id, host_id, customer_id, customer_name, type, amount, duration, rate, timestamp, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, 'completed', $9)`,
      [transactionId, session.host_id, session.customer_id, 'Customer', session.call_type, amount, duration, session.rate, 'Call completed']
    );

    res.json({
      success: true,
      message: 'Call ended successfully',
      transactionId: transactionId
    });
  } catch (error) {
    console.error('❌ End call error:', error);
    res.status(500).json({ error: 'Failed to end call' });
  }
});

// Start server
app.listen(port, async () => {
  console.log(`🚀 Friendy API server running on http://localhost:${port}`);
  console.log(`💸 Transactions API: http://localhost:${port}/transactions`);
  console.log(`📞 Call Requests API: http://localhost:${port}/call-requests`);
  console.log(`🎥 Agora API: http://localhost:${port}/agora`);
  console.log(`👑 Admin panel endpoints available`);

  try {
    console.log('🔄 Initializing database...');
    await initializeDatabase();
    console.log('✅ Server fully ready!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  }
});