// Comprehensive Admin Server with All Host Management Features
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors({
  origin: ['http://localhost:3001', 'https://admin-panel-friendy.vercel.app'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use('/uploads', express.static('uploads'));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Friendy Admin Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint with API documentation
app.get('/', (req, res) => {
  res.json({
    message: 'Friendy Comprehensive Admin Backend API',
    status: 'running',
    version: '2.0.0',
    features: [
      'Complete Host Management',
      'Host Pricing Management',
      'Host Earnings & Analytics',
      'Host Media Management',
      'Bulk Operations',
      'Data Export',
      'Advanced Search'
    ],
    endpoints: {
      dashboard: 'GET /admin/dashboard',
      hosts: {
        list: 'GET /admin/hosts',
        create: 'POST /auth/host/register',
        profile: 'GET /api/hosts/:id/profile',
        update: 'PUT /api/hosts/:id/profile',
        delete: 'DELETE /admin/delete-host/:id',
        approve: 'POST /admin/approve-host/:id',
        reject: 'POST /admin/reject-host/:id'
      },
      pricing: {
        get: 'GET /host/pricing/:hostId',
        update: 'POST /host/pricing/:hostId',
        bulk_update: 'POST /admin/hosts/bulk-pricing'
      },
      earnings: {
        summary: 'GET /earnings-summary/:hostId',
        transactions: 'GET /transactions/:hostId',
        call_sessions: 'GET /call-sessions/:hostId',
        analytics: 'GET /admin/hosts/analytics/:hostId'
      },
      media: {
        list: 'GET /api/hosts/:hostId/media',
        upload: 'POST /api/hosts/:hostId/media/upload',
        delete: 'DELETE /api/hosts/:hostId/media/:mediaId',
        set_primary: 'PUT /api/hosts/:hostId/media/:mediaId/primary'
      },
      bulk_operations: 'POST /admin/hosts/bulk',
      export: 'POST /admin/hosts/export',
      search: 'POST /admin/hosts/search'
    }
  });
});

// ==================== EXISTING ENDPOINTS ====================

// Comprehensive Dashboard stats
app.get('/admin/dashboard', async (req, res) => {
  try {
    console.log('📊 Comprehensive Dashboard endpoint called');

    // Get user statistics
    const userStats = await pool.query(`
      SELECT
        COUNT(*) as total_users,
        COUNT(CASE WHEN user_type = 'host' THEN 1 END) as total_hosts,
        COUNT(CASE WHEN user_type = 'customer' THEN 1 END) as total_customers,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
        COUNT(CASE WHEN user_type = 'agent' THEN 1 END) as total_agents,
        COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users
      FROM users
    `);

    // Get host-specific statistics
    const hostStats = await pool.query(`
      SELECT
        COUNT(CASE WHEN hp.approval_status = 'pending' THEN 1 END) as pending_hosts,
        COUNT(CASE WHEN hp.approval_status = 'approved' THEN 1 END) as approved_hosts,
        COUNT(CASE WHEN hp.is_online = true THEN 1 END) as online_hosts,
        COUNT(CASE WHEN hp.is_featured = true THEN 1 END) as featured_hosts
      FROM host_profiles hp
      JOIN users u ON hp.user_id = u.id
    `);

    // Get agency statistics
    const agencyStats = await pool.query(`
      SELECT
        COUNT(*) as total_agencies,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_agencies,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_agencies
      FROM agencies
    `);

    // Get active calls count
    const callStats = await pool.query(`
      SELECT COUNT(*) as calls_running
      FROM call_sessions
      WHERE status = 'active'
    `);

    // Get revenue statistics
    const revenueStats = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN amount ELSE 0 END), 0) as revenue_today,
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN amount ELSE 0 END), 0) as revenue_weekly,
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN amount ELSE 0 END), 0) as revenue_monthly,
        COALESCE(SUM(amount), 0) as revenue_lifetime
      FROM transactions
      WHERE transaction_type IN ('recharge', 'call_payment', 'message_payment', 'gift_payment')
      AND status = 'completed'
    `);

    // Get pending withdrawals
    const withdrawalStats = await pool.query(`
      SELECT COUNT(*) as pending_withdrawals
      FROM withdrawals
      WHERE status = 'pending'
    `);

    // Get support ticket statistics
    const supportStats = await pool.query(`
      SELECT
        COUNT(*) as total_tickets,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_tickets,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_tickets
      FROM support_tickets
    `);

    // Get content reports
    const reportStats = await pool.query(`
      SELECT
        COUNT(*) as total_reports,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_reports,
        COUNT(CASE WHEN reason LIKE '%fraud%' OR reason LIKE '%scam%' THEN 1 END) as fraud_reports
      FROM content_reports
    `);

    // Get top 5 hosts by earnings
    const topHosts = await pool.query(`
      SELECT u.name, hp.total_earnings as earnings
      FROM host_profiles hp
      JOIN users u ON hp.user_id = u.id
      ORDER BY hp.total_earnings DESC
      LIMIT 5
    `);

    // Get top 5 spenders
    const topSpenders = await pool.query(`
      SELECT u.name, cp.total_spent as spent
      FROM customer_profiles cp
      JOIN users u ON cp.user_id = u.id
      ORDER BY cp.total_spent DESC
      LIMIT 5
    `);

    // Get top 5 agencies by host count
    const topAgencies = await pool.query(`
      SELECT name, total_hosts as hosts
      FROM agencies
      ORDER BY total_hosts DESC
      LIMIT 5
    `);

    const stats = {
      // User stats
      ...userStats.rows[0],

      // Host stats
      ...hostStats.rows[0],

      // Agency stats
      ...agencyStats.rows[0],

      // Call stats
      ...callStats.rows[0],

      // Revenue stats
      ...revenueStats.rows[0],

      // Withdrawal stats
      ...withdrawalStats.rows[0],

      // Support stats
      ...supportStats.rows[0],

      // Report stats
      ...reportStats.rows[0],

      // Top lists
      top_hosts: topHosts.rows,
      top_spenders: topSpenders.rows,
      top_agencies: topAgencies.rows
    };

    // Convert string numbers to appropriate types
    Object.keys(stats).forEach(key => {
      if (typeof stats[key] === 'string' && !isNaN(stats[key])) {
        stats[key] = parseInt(stats[key]);
      }
    });

    res.json({
      success: true,
      stats,
      message: 'Comprehensive dashboard stats loaded successfully'
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard stats',
      error: error.message,
      stats: {
        total_users: 0,
        total_hosts: 0,
        total_customers: 0,
        active_users: 0,
        calls_running: 0,
        revenue_today: 0,
        revenue_weekly: 0,
        revenue_monthly: 0,
        revenue_lifetime: 0,
        pending_hosts: 0,
        pending_agencies: 0,
        pending_withdrawals: 0,
        open_tickets: 0,
        pending_reports: 0,
        fraud_reports: 0,
        top_hosts: [],
        top_spenders: [],
        top_agencies: []
      }
    });
  }
});

// Get all hosts
app.get('/admin/hosts', async (req, res) => {
  try {
    console.log('👥 All hosts endpoint called');

    const result = await pool.query(`
      SELECT 
        h.*,
        hp.video_call_rate,
        hp.voice_call_rate,
        hp.message_rate,
        hp.streaming_rate
      FROM hosts h
      LEFT JOIN host_pricing hp ON h.id = hp.host_id
      ORDER BY h.created_at DESC
    `);

    // Transform data to match frontend expectations
    const hosts = result.rows.map(host => ({
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
      profile_image: host.profile_image || host.profile_photo_url,
      is_approved: host.is_verified,
      approval_status: host.is_verified ? 'approved' : 'pending',
      is_vip: host.is_vip || false,
      vip_status: host.vip_status || 'regular',
      online_status: host.is_online ? 'online' : 'offline',
      busy_status: host.is_busy ? 'busy' : 'available',
      live_status: host.is_live ? 'live' : 'offline',
      total_earnings: parseFloat(host.total_earnings || 0),
      total_calls: host.total_calls || 0,
      total_minutes: host.total_minutes || 0,
      rating: parseFloat(host.rating || 0),
      created_at: host.created_at,
      updated_at: host.updated_at,
      pricing: {
        video_call_rate: parseFloat(host.video_call_rate || 0),
        voice_call_rate: parseFloat(host.voice_call_rate || 0),
        message_rate: parseFloat(host.message_rate || 0),
        streaming_rate: parseFloat(host.streaming_rate || 0)
      }
    }));

    res.json({
      success: true,
      hosts,
      count: hosts.length,
      message: 'All hosts loaded successfully'
    });

  } catch (error) {
    console.error('Get all hosts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load hosts',
      error: error.message
    });
  }
});

// Get host requests (pending approvals)
app.get('/admin/host-requests', async (req, res) => {
  try {
    console.log('📋 Host requests endpoint called');

    const result = await pool.query(`
      SELECT * FROM hosts 
      WHERE is_verified = false 
      ORDER BY created_at DESC
    `);

    const requests = result.rows.map(host => ({
      id: host.id,
      name: host.name,
      email: host.email,
      phone: host.phone,
      age: host.age,
      gender: host.gender,
      city: host.city,
      bio: host.bio,
      profile_image: host.profile_image || host.profile_photo_url,
      created_at: host.created_at,
      profile_completed: !!(host.name && host.email && host.age && host.gender && host.city)
    }));

    res.json({
      success: true,
      requests,
      count: requests.length,
      message: 'Host requests loaded successfully'
    });

  } catch (error) {
    console.error('Get host requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load host requests',
      error: error.message
    });
  }
});

// Approve host
app.post('/admin/approve-host/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    console.log('✅ Approving host:', hostId);

    const result = await pool.query(`
      UPDATE hosts 
      SET is_verified = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, name, email
    `, [hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Host not found'
      });
    }

    res.json({
      success: true,
      message: 'Host approved successfully',
      host: result.rows[0]
    });

  } catch (error) {
    console.error('Approve host error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve host',
      error: error.message
    });
  }
});

// Reject host
app.post('/admin/reject-host/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    console.log('❌ Rejecting host:', hostId);

    const result = await pool.query(`
      UPDATE hosts 
      SET is_verified = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, name, email
    `, [hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Host not found'
      });
    }

    res.json({
      success: true,
      message: 'Host rejected successfully',
      host: result.rows[0]
    });

  } catch (error) {
    console.error('Reject host error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject host',
      error: error.message
    });
  }
});

// Delete host
app.delete('/admin/delete-host/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    console.log('🗑️ Deleting host:', hostId);

    const result = await pool.query(`
      DELETE FROM hosts 
      WHERE id = $1 
      RETURNING id, name, email
    `, [hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Host not found'
      });
    }

    res.json({
      success: true,
      message: 'Host deleted successfully',
      host: result.rows[0]
    });

  } catch (error) {
    console.error('Delete host error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete host',
      error: error.message
    });
  }
});

// Import additional endpoint modules
try {
  const adminHostEndpoints = require('./admin-host-endpoints');
  const adminExportEndpoints = require('./admin-export-endpoints');
  const adminCustomerEndpoints = require('./admin-customer-endpoints');
  const hostMediaEndpoints = require('./host-media-endpoints');
  const hostEndpoints = require('./host-endpoints');
  const earningsEndpoints = require('./earnings-endpoints');

  app.use(adminHostEndpoints);
  app.use(adminExportEndpoints);
  app.use(adminCustomerEndpoints);
  app.use(hostMediaEndpoints);
  app.use(hostEndpoints);
  app.use(earningsEndpoints);

  console.log('✅ All endpoint modules loaded successfully');
} catch (error) {
  console.log('⚠️ Some endpoint modules not found, using basic endpoints only');
}

// ==================== MISSING ADMIN ENDPOINTS ====================

// Customer Management Endpoints
app.get('/admin/customers', async (req, res) => {
  try {
    const { search = '', status, user_type = 'customer' } = req.query;

    let query = `
      SELECT u.*, cp.total_spent, cp.total_calls, cp.total_messages
      FROM users u
      LEFT JOIN customer_profiles cp ON u.id = cp.user_id
      WHERE (u.role = 'customer' OR u.role IS NULL)
    `;

    const params = [];

    if (search) {
      query += ` AND (u.name ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    if (status && status !== 'undefined') {
      query += ` AND u.is_active = $${params.length + 1}`;
      params.push(status === 'active');
    }

    query += ' ORDER BY u.created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      customers: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch customers' });
  }
});

// Customer Transactions
app.get('/admin/customers/transactions', async (req, res) => {
  try {
    const { customerId, type = 'all', startDate, endDate, search = '' } = req.query;

    let query = `
      SELECT t.*, u.name as customer_name, u.email as customer_email
      FROM transactions t
      LEFT JOIN users u ON t.customer_id = u.id
      WHERE 1=1
    `;

    const params = [];

    if (customerId) {
      query += ` AND t.customer_id = $${params.length + 1}`;
      params.push(customerId);
    }

    if (type !== 'all') {
      query += ` AND t.transaction_type = $${params.length + 1}`;
      params.push(type);
    }

    if (startDate) {
      query += ` AND t.created_at >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND t.created_at <= $${params.length + 1}`;
      params.push(endDate);
    }

    query += ' ORDER BY t.created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      transactions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
});

// Customer Activities
app.get('/admin/customers/activities', async (req, res) => {
  try {
    const { customerId, type = 'all', startDate, endDate, search = '' } = req.query;

    let query = `
      SELECT ca.*, u.name as customer_name
      FROM customer_activities ca
      LEFT JOIN users u ON ca.customer_id = u.id
      WHERE 1=1
    `;

    const params = [];

    if (customerId) {
      query += ` AND ca.customer_id = $${params.length + 1}`;
      params.push(customerId);
    }

    if (type !== 'all') {
      query += ` AND ca.activity_type = $${params.length + 1}`;
      params.push(type);
    }

    if (startDate) {
      query += ` AND ca.created_at >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND ca.created_at <= $${params.length + 1}`;
      params.push(endDate);
    }

    query += ' ORDER BY ca.created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      activities: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activities' });
  }
});

// Support Tickets
app.get('/admin/support/tickets', async (req, res) => {
  try {
    const { status = 'all', priority = 'all', search = '' } = req.query;

    let query = `
      SELECT st.*, u.name as customer_name, u.email as customer_email
      FROM support_tickets st
      LEFT JOIN users u ON st.customer_id = u.id
      WHERE 1=1
    `;

    const params = [];

    if (status !== 'all') {
      query += ` AND st.status = $${params.length + 1}`;
      params.push(status);
    }

    if (priority !== 'all') {
      query += ` AND st.priority = $${params.length + 1}`;
      params.push(priority);
    }

    if (search) {
      query += ` AND (st.subject ILIKE $${params.length + 1} OR st.description ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY st.created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      tickets: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch support tickets' });
  }
});

// Coin Packages
app.get('/admin/coin-packages', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM coin_packages
      ORDER BY coins ASC
    `);

    res.json({
      success: true,
      packages: result.rows
    });
  } catch (error) {
    console.error('Error fetching coin packages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch coin packages' });
  }
});

// Host Pricing
app.get('/host/pricing/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query(`
      SELECT hp.*, u.name, u.email
      FROM host_pricing hp
      LEFT JOIN users u ON hp.host_id = u.id
      WHERE hp.host_id = $1
    `, [hostId]);

    if (result.rows.length === 0) {
      // Return default pricing if none exists
      res.json({
        success: true,
        pricing: {
          host_id: hostId,
          voice_call_rate: 10,
          video_call_rate: 20,
          message_rate: 2,
          created_at: new Date(),
          updated_at: new Date()
        }
      });
    } else {
      res.json({
        success: true,
        pricing: result.rows[0]
      });
    }
  } catch (error) {
    console.error('Error fetching host pricing:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch host pricing' });
  }
});

// Host Earnings Summary
app.get('/earnings-summary/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query(`
      SELECT
        COALESCE(SUM(amount), 0) as total_earnings,
        COUNT(*) as total_transactions,
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN amount ELSE 0 END), 0) as today_earnings,
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN amount ELSE 0 END), 0) as week_earnings,
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN amount ELSE 0 END), 0) as month_earnings
      FROM transactions
      WHERE host_id = $1 AND transaction_type IN ('host_earning', 'call_payment', 'message_payment')
    `, [hostId]);

    res.json({
      success: true,
      earnings: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching host earnings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch host earnings' });
  }
});

// ==================== ADDITIONAL MISSING ENDPOINTS ====================

// Gifts Management
app.get('/admin/gifts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM gifts
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      gifts: result.rows || []
    });
  } catch (error) {
    console.error('Error fetching gifts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch gifts', gifts: [] });
  }
});

app.post('/admin/gifts', async (req, res) => {
  try {
    const { name, image_url, coin_value, category, description, is_active } = req.body;

    const result = await pool.query(`
      INSERT INTO gifts (name, image_url, coin_value, category, description, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `, [name, image_url, coin_value, category, description, is_active]);

    res.json({
      success: true,
      gift: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating gift:', error);
    res.status(500).json({ success: false, error: 'Failed to create gift' });
  }
});

app.put('/admin/gifts/:giftId', async (req, res) => {
  try {
    const { giftId } = req.params;
    const { name, coin_value, category } = req.body;

    const result = await pool.query(`
      UPDATE gifts
      SET name = $1, coin_value = $2, category = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, [name, coin_value, category, giftId]);

    res.json({
      success: true,
      gift: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating gift:', error);
    res.status(500).json({ success: false, error: 'Failed to update gift' });
  }
});

app.delete('/admin/gifts/:giftId', async (req, res) => {
  try {
    const { giftId } = req.params;

    await pool.query('DELETE FROM gifts WHERE id = $1', [giftId]);

    res.json({
      success: true,
      message: 'Gift deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting gift:', error);
    res.status(500).json({ success: false, error: 'Failed to delete gift' });
  }
});

// Agencies Management
app.get('/admin/agencies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, COUNT(h.id) as total_hosts
      FROM agencies a
      LEFT JOIN hosts h ON h.agency_id = a.id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);

    res.json({
      success: true,
      agencies: result.rows || []
    });
  } catch (error) {
    console.error('Error fetching agencies:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch agencies', agencies: [] });
  }
});

app.post('/admin/agencies', async (req, res) => {
  try {
    const { name, email, phone, contact_person, address, commission_percentage, status } = req.body;

    const result = await pool.query(`
      INSERT INTO agencies (name, email, phone, contact_person, address, commission_percentage, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `, [name, email, phone, contact_person, address, commission_percentage, status]);

    res.json({
      success: true,
      agency: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating agency:', error);
    res.status(500).json({ success: false, error: 'Failed to create agency' });
  }
});

app.put('/admin/agencies/:agencyId', async (req, res) => {
  try {
    const { agencyId } = req.params;
    const { name, commission_percentage, status } = req.body;

    const result = await pool.query(`
      UPDATE agencies
      SET name = $1, commission_percentage = $2, status = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, [name, commission_percentage, status, agencyId]);

    res.json({
      success: true,
      agency: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating agency:', error);
    res.status(500).json({ success: false, error: 'Failed to update agency' });
  }
});

app.put('/admin/agencies/:agencyId/status', async (req, res) => {
  try {
    const { agencyId } = req.params;
    const { status } = req.body;

    const result = await pool.query(`
      UPDATE agencies
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, agencyId]);

    res.json({
      success: true,
      agency: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating agency status:', error);
    res.status(500).json({ success: false, error: 'Failed to update agency status' });
  }
});

// Call & Chat Monitoring
app.get('/admin/calls/active', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cs.*, u1.name as customer_name, u2.name as host_name
      FROM call_sessions cs
      LEFT JOIN users u1 ON cs.customer_id = u1.id
      LEFT JOIN users u2 ON cs.host_id = u2.id
      WHERE cs.status = 'active'
      ORDER BY cs.created_at DESC
    `);

    res.json({
      success: true,
      calls: result.rows || [],
      recent_calls: []
    });
  } catch (error) {
    console.error('Error fetching active calls:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch active calls', calls: [], recent_calls: [] });
  }
});

app.get('/admin/messages/recent', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, u1.name as sender_name, u2.name as receiver_name
      FROM messages m
      LEFT JOIN users u1 ON m.sender_id = u1.id
      LEFT JOIN users u2 ON m.receiver_id = u2.id
      ORDER BY m.created_at DESC
      LIMIT 50
    `);

    res.json({
      success: true,
      messages: result.rows || []
    });
  } catch (error) {
    console.error('Error fetching recent messages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recent messages', messages: [] });
  }
});

app.post('/admin/calls/:callId/end', async (req, res) => {
  try {
    const { callId } = req.params;

    const result = await pool.query(`
      UPDATE call_sessions
      SET status = 'ended', ended_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [callId]);

    res.json({
      success: true,
      call: result.rows[0]
    });
  } catch (error) {
    console.error('Error ending call:', error);
    res.status(500).json({ success: false, error: 'Failed to end call' });
  }
});

app.post('/admin/calls/:callId/report', async (req, res) => {
  try {
    const { callId } = req.params;
    const { reason } = req.body;

    await pool.query(`
      INSERT INTO content_reports (reported_content_type, reported_content_id, reason, status, created_at)
      VALUES ('call', $1, $2, 'pending', CURRENT_TIMESTAMP)
    `, [callId, reason]);

    res.json({
      success: true,
      message: 'Call reported successfully'
    });
  } catch (error) {
    console.error('Error reporting call:', error);
    res.status(500).json({ success: false, error: 'Failed to report call' });
  }
});

// Analytics
app.get('/admin/analytics', async (req, res) => {
  try {
    const { dateRange, reportType } = req.query;

    // Mock analytics data
    const analytics = {
      total_revenue: 50000,
      revenue_growth: 15.5,
      total_users: 1250,
      user_growth: 8.2,
      total_calls: 3450,
      calls_growth: 12.1,
      total_messages: 15600,
      messages_growth: 22.3,
      call_revenue: 35000,
      message_revenue: 12000,
      gift_revenue: 3000,
      platform_commission: 15000,
      host_earnings: 35000,
      agency_commission: 5000,
      top_hosts: [
        { id: 1, name: 'Host 1', earnings: 5000 },
        { id: 2, name: 'Host 2', earnings: 4500 }
      ],
      new_users: 125,
      active_users: 890,
      retention_rate: 75,
      churn_rate: 8,
      video_calls: 2100,
      voice_calls: 1350,
      avg_call_duration: 12,
      successful_calls: 95,
      failed_calls: 5,
      avg_call_rating: 4.2,
      peak_hours: [
        { time: '20:00-21:00', calls: 450, percentage: 85 },
        { time: '21:00-22:00', calls: 420, percentage: 80 }
      ],
      text_messages: 12000,
      image_messages: 3600,
      avg_response_time: 45
    };

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics', analytics: {} });
  }
});

// Content Reports
app.get('/admin/content-reports', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cr.*, u1.name as reported_user_name, u2.name as reporter_name
      FROM content_reports cr
      LEFT JOIN users u1 ON cr.reported_user_id = u1.id
      LEFT JOIN users u2 ON cr.reporter_id = u2.id
      ORDER BY cr.created_at DESC
    `);

    res.json({
      success: true,
      reports: result.rows || []
    });
  } catch (error) {
    console.error('Error fetching content reports:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch content reports', reports: [] });
  }
});

app.put('/admin/content-reports/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action, reason } = req.body;

    const result = await pool.query(`
      UPDATE content_reports
      SET status = $1, admin_notes = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [action, reason, reportId]);

    res.json({
      success: true,
      report: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ success: false, error: 'Failed to update report' });
  }
});

app.post('/admin/users/:userId/moderate', async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, duration } = req.body;

    let updateQuery = '';
    let params = [userId];

    if (action === 'warning') {
      updateQuery = 'UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1 WHERE id = $1';
    } else if (action === 'suspend') {
      updateQuery = 'UPDATE users SET is_suspended = true, suspension_until = $2 WHERE id = $1';
      params.push(new Date(Date.now() + (duration === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)));
    } else if (action === 'ban') {
      updateQuery = 'UPDATE users SET is_banned = true WHERE id = $1';
    }

    await pool.query(updateQuery, params);

    res.json({
      success: true,
      message: `User ${action} applied successfully`
    });
  } catch (error) {
    console.error('Error moderating user:', error);
    res.status(500).json({ success: false, error: 'Failed to moderate user' });
  }
});

// App Settings
app.get('/admin/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM app_settings');

    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    res.json({
      success: true,
      settings: {
        app_name: 'Friendy',
        app_version: '1.0.0',
        maintenance_mode: false,
        registration_enabled: true,
        email_verification_required: true,
        phone_verification_required: false,
        session_timeout: 30,
        max_login_attempts: 5,
        password_min_length: 8,
        require_strong_password: true,
        two_factor_auth_enabled: false,
        commission_percentage: 30,
        minimum_withdrawal: 100,
        withdrawal_processing_days: 3,
        payment_gateway_enabled: true,
        max_message_length: 500,
        image_upload_enabled: true,
        video_call_enabled: true,
        voice_call_enabled: true,
        email_notifications: true,
        push_notifications: true,
        sms_notifications: false,
        admin_alerts: true,
        ...settings
      }
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings', settings: {} });
  }
});

app.put('/admin/settings', async (req, res) => {
  try {
    const settings = req.body;

    for (const [key, value] of Object.entries(settings)) {
      await pool.query(`
        INSERT INTO app_settings (setting_key, setting_value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
      `, [key, value]);
    }

    res.json({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// Export Reports
app.get('/admin/reports/export', async (req, res) => {
  try {
    const { dateRange, reportType, format } = req.query;

    // Mock export data
    const exportData = {
      data: 'Mock export data for ' + reportType,
      format: format
    };

    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ success: false, error: 'Failed to export report' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// User Management
app.get('/admin/users', async (req, res) => {
  try {
    const { search = '', status = 'all', role = 'all' } = req.query;

    let query = `
      SELECT u.*,
        COALESCE(cp.total_spent, 0) as total_spent,
        COALESCE(hp.total_earnings, 0) as total_earnings
      FROM users u
      LEFT JOIN customer_profiles cp ON u.id = cp.user_id
      LEFT JOIN host_profiles hp ON u.id = hp.user_id
      WHERE 1=1
    `;

    const params = [];

    if (search) {
      query += ` AND (u.name ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    if (status !== 'all') {
      query += ` AND u.is_active = $${params.length + 1}`;
      params.push(status === 'active');
    }

    if (role !== 'all') {
      query += ` AND u.role = $${params.length + 1}`;
      params.push(role);
    }

    query += ' ORDER BY u.created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      users: result.rows || []
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users', users: [] });
  }
});

app.put('/admin/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    const result = await pool.query(`
      UPDATE users
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status === 'active', userId]);

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ success: false, error: 'Failed to update user status' });
  }
});

app.post('/admin/users/:userId/suspend', async (req, res) => {
  try {
    const { userId } = req.params;
    const { days, reason } = req.body;

    const suspensionUntil = new Date();
    suspensionUntil.setDate(suspensionUntil.getDate() + days);

    const result = await pool.query(`
      UPDATE users
      SET is_suspended = true, suspension_until = $1, suspension_reason = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [suspensionUntil, reason, userId]);

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({ success: false, error: 'Failed to suspend user' });
  }
});

app.post('/admin/users/:userId/reset-password', async (req, res) => {
  try {
    const { userId } = req.params;

    // Generate a temporary password
    const tempPassword = Math.random().toString(36).slice(-8);

    const result = await pool.query(`
      UPDATE users
      SET password_reset_required = true, temp_password = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, email, name
    `, [tempPassword, userId]);

    res.json({
      success: true,
      user: result.rows[0],
      temp_password: tempPassword
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

// Withdrawals Management
app.get('/admin/withdrawals', async (req, res) => {
  try {
    const { status = 'all', hostId } = req.query;

    let query = `
      SELECT w.*, h.name as host_name, h.email as host_email
      FROM withdrawals w
      LEFT JOIN hosts h ON w.host_id = h.id
      WHERE 1=1
    `;

    const params = [];

    if (status !== 'all') {
      query += ` AND w.status = $${params.length + 1}`;
      params.push(status);
    }

    if (hostId) {
      query += ` AND w.host_id = $${params.length + 1}`;
      params.push(hostId);
    }

    query += ' ORDER BY w.created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      withdrawals: result.rows || []
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch withdrawals', withdrawals: [] });
  }
});

app.put('/admin/withdrawals/:withdrawalId/status', async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const { status } = req.body;

    const result = await pool.query(`
      UPDATE withdrawals
      SET status = $1, processed_at = CASE WHEN $1 = 'approved' THEN CURRENT_TIMESTAMP ELSE processed_at END, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, withdrawalId]);

    res.json({
      success: true,
      withdrawal: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating withdrawal status:', error);
    res.status(500).json({ success: false, error: 'Failed to update withdrawal status' });
  }
});

// Transactions
app.get('/admin/transactions', async (req, res) => {
  try {
    const { type = 'all', startDate, endDate, userId } = req.query;

    let query = `
      SELECT t.*, u.name as user_name, u.email as user_email
      FROM transactions t
      LEFT JOIN users u ON t.customer_id = u.id OR t.host_id = u.id
      WHERE 1=1
    `;

    const params = [];

    if (type !== 'all') {
      query += ` AND t.transaction_type = $${params.length + 1}`;
      params.push(type);
    }

    if (startDate) {
      query += ` AND t.created_at >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND t.created_at <= $${params.length + 1}`;
      params.push(endDate);
    }

    if (userId) {
      query += ` AND (t.customer_id = $${params.length + 1} OR t.host_id = $${params.length + 1})`;
      params.push(userId);
      params.push(userId);
    }

    query += ' ORDER BY t.created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      transactions: result.rows || []
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions', transactions: [] });
  }
});

// Host Media
app.get('/admin/hosts/:hostId/media', async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query(`
      SELECT * FROM host_media
      WHERE host_id = $1
      ORDER BY is_primary DESC, created_at DESC
    `, [hostId]);

    res.json({
      success: true,
      media: result.rows || []
    });
  } catch (error) {
    console.error('Error fetching host media:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch host media', media: [] });
  }
});

// Host Communication
app.get('/admin/hosts/:hostId/messages', async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query(`
      SELECT m.*, u.name as customer_name
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.receiver_id = $1 OR m.sender_id = $1
      ORDER BY m.created_at DESC
      LIMIT 50
    `, [hostId]);

    res.json({
      success: true,
      messages: result.rows || []
    });
  } catch (error) {
    console.error('Error fetching host messages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch host messages', messages: [] });
  }
});

app.get('/admin/hosts/:hostId/calls', async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query(`
      SELECT cs.*, u.name as customer_name
      FROM call_sessions cs
      LEFT JOIN users u ON cs.customer_id = u.id
      WHERE cs.host_id = $1
      ORDER BY cs.created_at DESC
      LIMIT 50
    `, [hostId]);

    res.json({
      success: true,
      calls: result.rows || []
    });
  } catch (error) {
    console.error('Error fetching host calls:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch host calls', calls: [] });
  }
});

// Host Streaming
app.get('/admin/hosts/:hostId/streams', async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query(`
      SELECT * FROM streaming_sessions
      WHERE host_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [hostId]);

    res.json({
      success: true,
      streams: result.rows || []
    });
  } catch (error) {
    console.error('Error fetching host streams:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch host streams', streams: [] });
  }
});

// 404 handler
app.use('*', (req, res) => {
  console.log('🔍 Endpoint not found:', req.originalUrl);
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Friendy Comprehensive Admin Backend running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/admin/dashboard`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
