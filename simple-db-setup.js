const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting database setup...');

    // Enable UUID extension
    console.log('📦 Enabling UUID extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Create users table
    console.log('👥 Creating users table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        firebase_uid VARCHAR(255) UNIQUE,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255),
        phone VARCHAR(20),
        age INTEGER,
        gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other')),
        location VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100) DEFAULT 'India',
        profile_image_url TEXT,
        profile_images TEXT[],
        bio TEXT,
        interests TEXT[],
        languages TEXT[],
        user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('customer', 'host', 'agent', 'agency', 'admin')),
        is_active BOOLEAN DEFAULT true,
        is_verified BOOLEAN DEFAULT false,
        is_blocked BOOLEAN DEFAULT false,
        blocked_until TIMESTAMP,
        block_reason TEXT,
        coins_balance INTEGER DEFAULT 50,
        is_premium BOOLEAN DEFAULT false,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create customer profiles table
    console.log('🛍️ Creating customer_profiles table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_profiles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        looking_for VARCHAR(20),
        relationship_type VARCHAR(50),
        occupation VARCHAR(255),
        education VARCHAR(255),
        height INTEGER,
        total_spent DECIMAL(10,2) DEFAULT 0.00,
        total_calls INTEGER DEFAULT 0,
        total_messages INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create agencies table
    console.log('🏢 Creating agencies table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS agencies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        contact_person VARCHAR(255),
        address TEXT,
        commission_percentage DECIMAL(5,2) DEFAULT 10.00,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'blocked')),
        total_hosts INTEGER DEFAULT 0,
        total_earnings DECIMAL(10,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create host profiles table
    console.log('🎭 Creating host_profiles table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS host_profiles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        agent_id UUID REFERENCES users(id),
        agency_id UUID REFERENCES agencies(id),
        is_online BOOLEAN DEFAULT false,
        is_live BOOLEAN DEFAULT false,
        is_featured BOOLEAN DEFAULT false,
        is_vip BOOLEAN DEFAULT false,
        approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
        commission_percentage DECIMAL(5,2) DEFAULT 70.00,
        total_earnings DECIMAL(10,2) DEFAULT 0.00,
        total_calls INTEGER DEFAULT 0,
        total_minutes INTEGER DEFAULT 0,
        rating DECIMAL(3,2) DEFAULT 0.00,
        rating_count INTEGER DEFAULT 0,
        specialties TEXT[],
        availability_hours JSONB,
        bank_account_number VARCHAR(50),
        bank_ifsc VARCHAR(20),
        bank_name VARCHAR(100),
        account_holder_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create transactions table
    console.log('💰 Creating transactions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        transaction_id VARCHAR(100) UNIQUE NOT NULL,
        customer_id UUID REFERENCES users(id),
        host_id UUID REFERENCES users(id),
        agent_id UUID REFERENCES users(id),
        agency_id UUID REFERENCES agencies(id),
        transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN (
          'recharge', 'call_payment', 'message_payment', 'gift_payment', 
          'host_earning', 'agent_commission', 'agency_commission',
          'refund', 'admin_credit', 'admin_debit'
        )),
        amount DECIMAL(10,2) NOT NULL,
        coins INTEGER,
        currency VARCHAR(10) DEFAULT 'INR',
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
        payment_method VARCHAR(50),
        payment_gateway VARCHAR(50),
        gateway_transaction_id VARCHAR(255),
        gateway_response JSONB,
        reference_id UUID,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    // Create coin packages table
    console.log('🪙 Creating coin_packages table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS coin_packages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        coins INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        bonus_coins INTEGER DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'INR',
        is_active BOOLEAN DEFAULT true,
        is_featured BOOLEAN DEFAULT false,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create support tickets table
    console.log('🎫 Creating support_tickets table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_number VARCHAR(20) UNIQUE NOT NULL,
        customer_id UUID REFERENCES users(id),
        subject VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(50) CHECK (category IN ('technical', 'payment', 'account', 'abuse', 'general')),
        priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
        assigned_to UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);

    // Create ticket replies table
    console.log('💬 Creating ticket_replies table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_replies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id),
        sender_type VARCHAR(20) CHECK (sender_type IN ('customer', 'admin')),
        message TEXT NOT NULL,
        attachments TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create app settings table
    console.log('⚙️ Creating app_settings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        setting_type VARCHAR(20) DEFAULT 'string' CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
        description TEXT,
        is_public BOOLEAN DEFAULT false,
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create customer activities table
    console.log('📊 Creating customer_activities table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_activities (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id UUID REFERENCES users(id),
        activity_type VARCHAR(30) CHECK (activity_type IN (
          'login', 'logout', 'profile_update', 'call', 'video_call', 
          'message', 'gift_sent', 'recharge', 'search'
        )),
        description TEXT,
        host_id UUID REFERENCES users(id),
        host_name VARCHAR(255),
        duration_minutes INTEGER DEFAULT 0,
        coins_spent INTEGER DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    console.log('📈 Creating indexes...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_host_id ON transactions(host_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON support_tickets(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_activities_customer_id ON customer_activities(customer_id)');

    // Insert default data
    console.log('📝 Inserting default data...');
    
    // Default coin packages
    await client.query(`
      INSERT INTO coin_packages (name, coins, price, bonus_coins, description, is_featured) VALUES
      ('Starter Pack', 100, 99.00, 10, 'Perfect for new users', false),
      ('Popular Pack', 500, 449.00, 75, 'Most popular choice', true),
      ('Premium Pack', 1000, 849.00, 200, 'Best value for money', false),
      ('VIP Pack', 2500, 1999.00, 500, 'For premium users', true),
      ('Ultimate Pack', 5000, 3799.00, 1200, 'Maximum value pack', false)
      ON CONFLICT DO NOTHING
    `);

    // Default app settings
    await client.query(`
      INSERT INTO app_settings (setting_key, setting_value, setting_type, description, is_public) VALUES
      ('app_name', 'Friendy', 'string', 'Application name', true),
      ('min_recharge_amount', '50', 'number', 'Minimum recharge amount in INR', false),
      ('min_withdrawal_amount', '100', 'number', 'Minimum withdrawal amount in INR', false),
      ('platform_commission', '30', 'number', 'Platform commission percentage', false),
      ('host_commission', '70', 'number', 'Host commission percentage', false)
      ON CONFLICT (setting_key) DO NOTHING
    `);

    // Create admin user
    await client.query(`
      INSERT INTO users (
        email, name, password_hash, user_type, is_active, is_verified
      ) VALUES (
        'admin@friendy.com', 
        'Admin User', 
        '$2b$10$example_hash_here', 
        'admin', 
        true, 
        true
      ) ON CONFLICT (email) DO NOTHING
    `);

    console.log('✅ Database setup completed successfully!');
    console.log('');
    console.log('📋 Created tables:');
    console.log('   • users (unified user management)');
    console.log('   • customer_profiles (customer data)');
    console.log('   • host_profiles (host data)');
    console.log('   • agencies (agency management)');
    console.log('   • transactions (financial tracking)');
    console.log('   • coin_packages (recharge plans)');
    console.log('   • support_tickets (customer support)');
    console.log('   • ticket_replies (support conversations)');
    console.log('   • app_settings (configuration)');
    console.log('   • customer_activities (analytics)');
    console.log('');
    console.log('🎯 Ready for admin panel use!');

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run setup if called directly
if (require.main === module) {
  setupDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { setupDatabase };
