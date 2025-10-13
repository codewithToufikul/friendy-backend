const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking database status...');
    
    // Check existing tables
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📋 Existing tables:');
    if (result.rows.length === 0) {
      console.log('   No tables found - database is empty');
    } else {
      result.rows.forEach(row => console.log('  •', row.table_name));
    }
    
    // Check if users table exists and its structure
    try {
      const userTableCheck = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        ORDER BY ordinal_position
      `);
      
      if (userTableCheck.rows.length > 0) {
        console.log('\n👥 Users table structure:');
        userTableCheck.rows.forEach(row => {
          console.log(`  • ${row.column_name}: ${row.data_type}`);
        });
      }
    } catch (e) {
      console.log('\n👥 Users table: Not found');
    }
    
    console.log('\n✅ Database check completed');
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

checkDatabase();
