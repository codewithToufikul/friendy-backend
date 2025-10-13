const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function setupComprehensiveDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting comprehensive database setup...');

    // Read and execute the comprehensive schema
    const schemaPath = path.join(__dirname, 'comprehensive-admin-schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📊 Creating comprehensive database schema...');
    await client.query(schemaSQL);
    console.log('✅ Database schema created successfully');

    // Insert default app settings
    console.log('⚙️ Inserting default app settings...');
    await client.query(`
      INSERT INTO app_settings (setting_key, setting_value, setting_type, description, is_public) VALUES
      ('app_name', 'Friendy', 'string', 'Application name', true),
      ('app_logo', '/assets/images/logo.png', 'string', 'Application logo URL', true),
      ('contact_email', 'support@friendy.com', 'string', 'Support contact email', true),
      ('contact_phone', '+91-9876543210', 'string', 'Support contact phone', true),
      ('coin_conversion_rate', '1', 'number', 'INR to coin conversion rate', false),
      ('min_recharge_amount', '50', 'number', 'Minimum recharge amount in INR', false),
      ('min_withdrawal_amount', '100', 'number', 'Minimum withdrawal amount in INR', false),
      ('platform_commission', '30', 'number', 'Platform commission percentage', false),
      ('host_commission', '70', 'number', 'Host commission percentage', false),
      ('agent_commission', '5', 'number', 'Agent commission percentage', false),
      ('agency_commission', '10', 'number', 'Agency commission percentage', false),
      ('session_timeout', '3600', 'number', 'Session timeout in seconds', false),
      ('max_file_upload_size', '10485760', 'number', 'Max file upload size in bytes (10MB)', false),
      ('enable_2fa', 'false', 'boolean', 'Enable two-factor authentication', false),
      ('maintenance_mode', 'false', 'boolean', 'Enable maintenance mode', false)
      ON CONFLICT (setting_key) DO NOTHING
    `);

    // Insert default coin packages
    console.log('💰 Creating default coin packages...');
    await client.query(`
      INSERT INTO coin_packages (name, coins, price, bonus_coins, description, is_featured) VALUES
      ('Starter Pack', 100, 99.00, 10, 'Perfect for new users', false),
      ('Popular Pack', 500, 449.00, 75, 'Most popular choice', true),
      ('Premium Pack', 1000, 849.00, 200, 'Best value for money', false),
      ('VIP Pack', 2500, 1999.00, 500, 'For premium users', true),
      ('Ultimate Pack', 5000, 3799.00, 1200, 'Maximum value pack', false)
      ON CONFLICT DO NOTHING
    `);

    // Insert default gifts
    console.log('🎁 Creating default gifts...');
    await client.query(`
      INSERT INTO gifts (name, image_url, coin_value, category, description) VALUES
      ('Red Rose', '/assets/gifts/red_rose.png', 5, 'romantic', 'A beautiful red rose'),
      ('Heart', '/assets/gifts/heart.png', 10, 'romantic', 'Show your love'),
      ('Chocolate', '/assets/gifts/chocolate.png', 15, 'romantic', 'Sweet chocolate gift'),
      ('Teddy Bear', '/assets/gifts/teddy.png', 25, 'romantic', 'Cute teddy bear'),
      ('Diamond Ring', '/assets/gifts/diamond_ring.png', 100, 'premium', 'Precious diamond ring'),
      ('Funny Face', '/assets/gifts/funny_face.png', 3, 'funny', 'Make them laugh'),
      ('Thumbs Up', '/assets/gifts/thumbs_up.png', 2, 'funny', 'Show appreciation'),
      ('Party Hat', '/assets/gifts/party_hat.png', 8, 'funny', 'Party time!'),
      ('Diwali Lamp', '/assets/gifts/diwali_lamp.png', 20, 'festival', 'Festival of lights'),
      ('Christmas Tree', '/assets/gifts/christmas_tree.png', 30, 'festival', 'Merry Christmas'),
      ('Crown', '/assets/gifts/crown.png', 200, 'premium', 'Royal crown'),
      ('Sports Car', '/assets/gifts/sports_car.png', 500, 'premium', 'Luxury sports car')
      ON CONFLICT DO NOTHING
    `);

    // Insert default blacklisted words
    console.log('🚫 Setting up content moderation...');
    await client.query(`
      INSERT INTO blacklisted_words (word, severity, action) VALUES
      ('spam', 'medium', 'filter'),
      ('scam', 'high', 'block'),
      ('fraud', 'high', 'block'),
      ('fake', 'medium', 'warn'),
      ('abuse', 'high', 'block'),
      ('harassment', 'high', 'block'),
      ('inappropriate', 'medium', 'filter')
      ON CONFLICT DO NOTHING
    `);

    // Create sample admin user
    console.log('👤 Creating sample admin user...');
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

    // Create sample agency
    console.log('🏢 Creating sample agency...');
    await client.query(`
      INSERT INTO agencies (
        name, email, contact_person, phone, address, status
      ) VALUES (
        'Premium Dating Agency', 
        'agency@example.com', 
        'John Manager', 
        '+91-9876543210', 
        '123 Business Street, Mumbai, India', 
        'active'
      ) ON CONFLICT (email) DO NOTHING
    `);

    // Insert sample commission settings
    console.log('💼 Setting up commission structure...');
    await client.query(`
      INSERT INTO commission_settings (entity_type, commission_percentage, min_withdrawal_amount) VALUES
      ('platform', 30.00, 0.00),
      ('host', 70.00, 100.00),
      ('agent', 5.00, 50.00),
      ('agency', 10.00, 200.00)
      ON CONFLICT DO NOTHING
    `);

    // Create indexes for better performance
    console.log('📈 Creating performance indexes...');
    await client.query(`
      -- Additional indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_users_user_type_active ON users(user_type, is_active);
      CREATE INDEX IF NOT EXISTS idx_transactions_customer_created ON transactions(customer_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_transactions_host_created ON transactions(host_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_call_sessions_created_at ON call_sessions(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at);
      CREATE INDEX IF NOT EXISTS idx_customer_activities_created_at ON customer_activities(created_at);
      CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
      CREATE INDEX IF NOT EXISTS idx_host_profiles_approval_status ON host_profiles(approval_status);
      CREATE INDEX IF NOT EXISTS idx_agencies_status ON agencies(status);
    `);

    console.log('✅ Comprehensive database setup completed successfully!');
    console.log('');
    console.log('📋 Database includes:');
    console.log('   • Complete user management system');
    console.log('   • Host and customer profiles');
    console.log('   • Agency and agent management');
    console.log('   • Comprehensive transaction system');
    console.log('   • Gifts and coin packages');
    console.log('   • Support ticket system');
    console.log('   • Content moderation tools');
    console.log('   • Analytics and reporting tables');
    console.log('   • Settings and configuration');
    console.log('   • Performance optimized indexes');
    console.log('');
    console.log('🎯 Ready for production use!');

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Function to reset database (use with caution)
async function resetDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('⚠️ RESETTING DATABASE - ALL DATA WILL BE LOST!');
    
    // Drop all tables in correct order (reverse of dependencies)
    const dropTables = [
      'ticket_replies',
      'support_tickets',
      'user_penalties',
      'content_reports',
      'blacklisted_words',
      'customer_activities',
      'commission_settings',
      'app_settings',
      'streaming_sessions',
      'messages',
      'call_sessions',
      'withdrawals',
      'transactions',
      'gift_transactions',
      'gifts',
      'coin_packages',
      'host_pricing',
      'agent_profiles',
      'agencies',
      'host_profiles',
      'customer_profiles',
      'users'
    ];

    for (const table of dropTables) {
      await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      console.log(`🗑️ Dropped table: ${table}`);
    }

    console.log('✅ Database reset completed');
    
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Function to check database health
async function checkDatabaseHealth() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking database health...');
    
    // Check if all required tables exist
    const requiredTables = [
      'users', 'customer_profiles', 'host_profiles', 'agencies', 'agent_profiles',
      'host_pricing', 'coin_packages', 'gifts', 'transactions', 'withdrawals',
      'call_sessions', 'messages', 'streaming_sessions', 'customer_activities',
      'support_tickets', 'ticket_replies', 'content_reports', 'user_penalties',
      'blacklisted_words', 'app_settings', 'commission_settings'
    ];

    const existingTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);

    const existingTableNames = existingTables.rows.map(row => row.table_name);
    const missingTables = requiredTables.filter(table => !existingTableNames.includes(table));

    if (missingTables.length === 0) {
      console.log('✅ All required tables exist');
      
      // Check data counts
      for (const table of ['users', 'coin_packages', 'gifts', 'app_settings']) {
        const count = await client.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`📊 ${table}: ${count.rows[0].count} records`);
      }
      
      console.log('✅ Database health check passed');
    } else {
      console.log('❌ Missing tables:', missingTables);
      console.log('🔧 Run setup to create missing tables');
    }

  } catch (error) {
    console.error('❌ Database health check failed:', error);
  } finally {
    client.release();
  }
}

// Export functions
module.exports = {
  setupComprehensiveDatabase,
  resetDatabase,
  checkDatabaseHealth
};

// Run setup if called directly
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'setup':
      setupComprehensiveDatabase()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
    case 'reset':
      resetDatabase()
        .then(() => setupComprehensiveDatabase())
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
    case 'health':
      checkDatabaseHealth()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
    default:
      console.log('Usage: node setup-comprehensive-database.js [setup|reset|health]');
      console.log('  setup  - Create all tables and insert default data');
      console.log('  reset  - Drop all tables and recreate with default data');
      console.log('  health - Check database health and table status');
      process.exit(1);
  }
}
