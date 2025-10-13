const { Pool } = require('pg');

// Database connection for setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/postgres',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function setupDatabase() {
  try {
    console.log('🔧 Setting up Friendy database...');

    // Create database if it doesn't exist
    try {
      await pool.query('CREATE DATABASE friendy_db');
      console.log('✅ Database "friendy_db" created successfully');
    } catch (error) {
      if (error.code === '42P04') {
        console.log('ℹ️  Database "friendy_db" already exists');
      } else {
        throw error;
      }
    }

    // Connect to the friendy_db database
    const friendyPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/friendy_db',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // Create tables
    console.log('📋 Creating tables...');

    // Hosts table
    await friendyPool.query(`
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
        languages TEXT[],
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
    console.log('✅ Hosts table created');

    // Host pricing table
    await friendyPool.query(`
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
    console.log('✅ Host pricing table created');

    // Call sessions table
    await friendyPool.query(`
      CREATE TABLE IF NOT EXISTS call_sessions (
        id SERIAL PRIMARY KEY,
        host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
        customer_id INTEGER,
        customer_name VARCHAR(255),
        call_type VARCHAR(20) NOT NULL,
        channel_name VARCHAR(255),
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        duration_minutes INTEGER DEFAULT 0,
        rate_per_minute DECIMAL(8,2),
        total_amount DECIMAL(10,2) DEFAULT 0.00,
        status VARCHAR(20) DEFAULT 'pending',
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Call sessions table created');

    // Streaming sessions table
    await friendyPool.query(`
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
        status VARCHAR(20) DEFAULT 'live',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Streaming sessions table created');

    // Messages table
    await friendyPool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
        customer_id INTEGER,
        customer_name VARCHAR(255),
        conversation_id VARCHAR(255),
        sender_type VARCHAR(20) NOT NULL,
        message_type VARCHAR(20) DEFAULT 'text',
        content TEXT,
        file_url TEXT,
        amount DECIMAL(8,2) DEFAULT 0.00,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Messages table created');

    // Transactions table
    await friendyPool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
        transaction_type VARCHAR(20) NOT NULL,
        reference_id INTEGER,
        amount DECIMAL(10,2) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Transactions table created');

    // Withdrawals table
    await friendyPool.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        bank_account_number VARCHAR(50),
        bank_ifsc VARCHAR(20),
        bank_name VARCHAR(100),
        account_holder_name VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Withdrawals table created');

    // Create indexes
    console.log('📊 Creating indexes...');
    await friendyPool.query(`
      CREATE INDEX IF NOT EXISTS idx_hosts_email ON hosts(email);
      CREATE INDEX IF NOT EXISTS idx_call_sessions_host_id ON call_sessions(host_id);
      CREATE INDEX IF NOT EXISTS idx_streaming_sessions_host_id ON streaming_sessions(host_id);
      CREATE INDEX IF NOT EXISTS idx_messages_host_id ON messages(host_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_host_id ON transactions(host_id);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_host_id ON withdrawals(host_id);
    `);
    console.log('✅ Indexes created');

    // Insert sample data for testing
    console.log('📝 Inserting sample data...');
    
    // Sample host (password: "password123")
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    const hostResult = await friendyPool.query(`
      INSERT INTO hosts (name, email, password_hash, phone, age, gender, city, state, bio, languages)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `, [
      'Priya Sharma',
      'priya@friendy.com',
      hashedPassword,
      '+91 98765 43210',
      25,
      'Female',
      'Mumbai',
      'Maharashtra',
      'Hi! I am Priya, a friendly host ready to chat and connect with you. I love music, movies, and making new friends!',
      ['Hindi', 'English']
    ]);

    if (hostResult.rows.length > 0) {
      const hostId = hostResult.rows[0].id;
      
      // Sample pricing
      await friendyPool.query(`
        INSERT INTO host_pricing (host_id, video_call_rate, voice_call_rate, message_rate, streaming_rate)
        VALUES ($1, 180.00, 120.00, 8.00, 60.00)
        ON CONFLICT (host_id) DO NOTHING
      `, [hostId]);

      // Sample transactions
      await friendyPool.query(`
        INSERT INTO transactions (host_id, transaction_type, amount, description, created_at)
        VALUES 
          ($1, 'call', 360.00, 'Video call with Rahul Kumar (20 minutes)', NOW() - INTERVAL '2 hours'),
          ($1, 'call', 240.00, 'Voice call with Sneha Patel (12 minutes)', NOW() - INTERVAL '5 hours'),
          ($1, 'message', 24.00, 'Messages with Arjun Singh (3 messages)', NOW() - INTERVAL '8 hours'),
          ($1, 'streaming', 450.00, 'Live streaming session (30 minutes)', NOW() - INTERVAL '1 day')
        ON CONFLICT DO NOTHING
      `, [hostId]);

      console.log('✅ Sample data inserted');
    }

    await friendyPool.end();
    console.log('🎉 Database setup completed successfully!');
    console.log('');
    console.log('📋 Sample Login Credentials:');
    console.log('Email: priya@friendy.com');
    console.log('Password: password123');
    console.log('');

  } catch (error) {
    console.error('❌ Database setup error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run setup if called directly
if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase };
