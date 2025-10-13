const express = require('express');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const app = express();

// ==================== CUSTOMER MANAGEMENT ENDPOINTS ====================

// Get all customers
app.get('/admin/customers', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status, verified } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE u.user_type = 'customer'";
    const queryParams = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      whereClause += ` AND (u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount} OR u.phone ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    if (status) {
      paramCount++;
      whereClause += ` AND u.is_active = $${paramCount}`;
      queryParams.push(status === 'active');
    }

    if (verified) {
      paramCount++;
      whereClause += ` AND u.is_verified = $${paramCount}`;
      queryParams.push(verified === 'verified');
    }

    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        u.location,
        u.profile_image_url,
        u.is_verified,
        u.is_active,
        u.created_at,
        u.updated_at,
        cp.age,
        cp.bio,
        cp.coins_balance,
        cp.interests,
        cp.looking_for,
        cp.education,
        cp.occupation
      FROM users u
      LEFT JOIN customer_profiles cp ON u.id = cp.user_id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      LEFT JOIN customer_profiles cp ON u.id = cp.user_id
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, queryParams.slice(0, -2));

    res.json({
      success: true,
      customers: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get customer profile
app.get('/admin/customers/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        u.location,
        u.profile_image_url,
        u.is_verified,
        u.is_active,
        u.created_at,
        u.updated_at,
        cp.age,
        cp.bio,
        cp.coins_balance,
        cp.interests,
        cp.looking_for,
        cp.height,
        cp.education,
        cp.occupation,
        cp.languages,
        cp.relationship_type
      FROM users u
      LEFT JOIN customer_profiles cp ON u.id = cp.user_id
      WHERE u.id = $1 AND u.user_type = 'customer'
    `;

    const result = await pool.query(query, [customerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    res.json({
      success: true,
      customer: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching customer profile:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update customer profile
app.put('/admin/customers/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const {
      name, email, phone, location, age, bio, interests, looking_for,
      height, education, occupation, languages, relationship_type,
      is_verified, is_active
    } = req.body;

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Update users table
      const userUpdateQuery = `
        UPDATE users 
        SET name = $1, email = $2, phone = $3, location = $4, 
            is_verified = $5, is_active = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $7 AND user_type = 'customer'
        RETURNING *
      `;

      const userResult = await client.query(userUpdateQuery, [
        name, email, phone, location, is_verified, is_active, customerId
      ]);

      if (userResult.rows.length === 0) {
        throw new Error('Customer not found');
      }

      // Update customer_profiles table
      const profileUpdateQuery = `
        UPDATE customer_profiles 
        SET age = $1, bio = $2, interests = $3, looking_for = $4,
            height = $5, education = $6, occupation = $7, languages = $8,
            relationship_type = $9, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $10
        RETURNING *
      `;

      await client.query(profileUpdateQuery, [
        age, bio, interests, looking_for, height, education, occupation,
        languages, relationship_type, customerId
      ]);

      await client.query('COMMIT');

      // Fetch updated customer data
      const updatedCustomer = await client.query(`
        SELECT 
          u.id, u.name, u.email, u.phone, u.location, u.profile_image_url,
          u.is_verified, u.is_active, u.created_at, u.updated_at,
          cp.age, cp.bio, cp.coins_balance, cp.interests, cp.looking_for,
          cp.height, cp.education, cp.occupation, cp.languages, cp.relationship_type
        FROM users u
        LEFT JOIN customer_profiles cp ON u.id = cp.user_id
        WHERE u.id = $1
      `, [customerId]);

      res.json({
        success: true,
        customer: updatedCustomer.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating customer profile:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update customer status
app.put('/admin/customers/status/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { status } = req.body;

    const query = `
      UPDATE users 
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND user_type = 'customer'
      RETURNING *
    `;

    const result = await pool.query(query, [status === 'active', customerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    res.json({
      success: true,
      customer: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating customer status:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get customer coins data
app.get('/admin/customers/coins/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    // Get current balance
    const balanceQuery = `
      SELECT coins_balance 
      FROM customer_profiles 
      WHERE user_id = $1
    `;

    const balanceResult = await pool.query(balanceQuery, [customerId]);

    if (balanceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    // Get transaction totals
    const transactionQuery = `
      SELECT 
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_recharged,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_spent
      FROM transactions 
      WHERE customer_id = $1
    `;

    const transactionResult = await pool.query(transactionQuery, [customerId]);

    res.json({
      success: true,
      coins: {
        balance: balanceResult.rows[0].coins_balance || 0,
        total_recharged: transactionResult.rows[0].total_recharged || 0,
        total_spent: transactionResult.rows[0].total_spent || 0
      }
    });
  } catch (error) {
    console.error('Error fetching customer coins:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Adjust customer coins
app.post('/admin/customers/coins/adjust/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { amount, type } = req.body; // type: 'add' or 'deduct'

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get current balance
      const balanceQuery = `
        SELECT coins_balance 
        FROM customer_profiles 
        WHERE user_id = $1
      `;

      const balanceResult = await client.query(balanceQuery, [customerId]);

      if (balanceResult.rows.length === 0) {
        throw new Error('Customer not found');
      }

      const currentBalance = balanceResult.rows[0].coins_balance || 0;
      const adjustmentAmount = type === 'add' ? amount : -amount;
      const newBalance = currentBalance + adjustmentAmount;

      if (newBalance < 0) {
        throw new Error('Insufficient balance');
      }

      // Update balance
      const updateQuery = `
        UPDATE customer_profiles 
        SET coins_balance = $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
        RETURNING coins_balance
      `;

      const updateResult = await client.query(updateQuery, [newBalance, customerId]);

      // Record transaction
      const transactionQuery = `
        INSERT INTO transactions (customer_id, amount, type, description, status)
        VALUES ($1, $2, $3, $4, 'completed')
      `;

      await client.query(transactionQuery, [
        customerId,
        adjustmentAmount,
        type === 'add' ? 'admin_credit' : 'admin_debit',
        `Admin ${type === 'add' ? 'added' : 'deducted'} ${amount} coins`
      ]);

      await client.query('COMMIT');

      res.json({
        success: true,
        coins: {
          balance: updateResult.rows[0].coins_balance,
          adjustment: adjustmentAmount
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error adjusting customer coins:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

// Get customer activity
app.get('/admin/customers/activity/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    // Get activity stats
    const statsQuery = `
      SELECT
        COUNT(CASE WHEN type IN ('call', 'video_call') THEN 1 END) as total_calls,
        COUNT(CASE WHEN type = 'message' THEN 1 END) as total_messages,
        SUM(CASE WHEN type IN ('call', 'video_call') THEN duration_minutes ELSE 0 END) as total_minutes
      FROM customer_activities
      WHERE customer_id = $1
    `;

    const statsResult = await pool.query(statsQuery, [customerId]);

    // Get recent activities
    const activitiesQuery = `
      SELECT
        id, type, description, host_name, duration_minutes,
        metadata, created_at
      FROM customer_activities
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const activitiesResult = await pool.query(activitiesQuery, [customerId]);

    res.json({
      success: true,
      activity: {
        total_calls: statsResult.rows[0].total_calls || 0,
        total_messages: statsResult.rows[0].total_messages || 0,
        total_minutes: statsResult.rows[0].total_minutes || 0,
        recent_activity: activitiesResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching customer activity:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get customer transactions
app.get('/admin/customers/transactions', async (req, res) => {
  try {
    const { customerId, type, startDate, endDate, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const queryParams = [];
    let paramCount = 0;

    if (customerId) {
      paramCount++;
      whereClause += ` AND t.customer_id = $${paramCount}`;
      queryParams.push(customerId);
    }

    if (type && type !== 'all') {
      paramCount++;
      whereClause += ` AND t.type = $${paramCount}`;
      queryParams.push(type);
    }

    if (startDate) {
      paramCount++;
      whereClause += ` AND t.created_at >= $${paramCount}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereClause += ` AND t.created_at <= $${paramCount}`;
      queryParams.push(endDate + ' 23:59:59');
    }

    if (search) {
      paramCount++;
      whereClause += ` AND (t.description ILIKE $${paramCount} OR t.transaction_id ILIKE $${paramCount} OR u.name ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    const query = `
      SELECT
        t.id, t.transaction_id, t.customer_id, t.amount, t.type,
        t.description, t.status, t.created_at,
        u.name as customer_name, u.email as customer_email
      FROM transactions t
      LEFT JOIN users u ON t.customer_id = u.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get stats
    const statsQuery = `
      SELECT
        COUNT(*) as total_transactions,
        SUM(amount) as total_amount,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_recharges,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_spending
      FROM transactions t
      LEFT JOIN users u ON t.customer_id = u.id
      ${whereClause}
    `;

    const statsResult = await pool.query(statsQuery, queryParams.slice(0, -2));

    res.json({
      success: true,
      transactions: result.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching customer transactions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get customer activities (for activity page)
app.get('/admin/customers/activities', async (req, res) => {
  try {
    const { customerId, type, startDate, endDate, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const queryParams = [];
    let paramCount = 0;

    if (customerId) {
      paramCount++;
      whereClause += ` AND ca.customer_id = $${paramCount}`;
      queryParams.push(customerId);
    }

    if (type && type !== 'all') {
      paramCount++;
      whereClause += ` AND ca.type = $${paramCount}`;
      queryParams.push(type);
    }

    if (startDate) {
      paramCount++;
      whereClause += ` AND ca.created_at >= $${paramCount}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereClause += ` AND ca.created_at <= $${paramCount}`;
      queryParams.push(endDate + ' 23:59:59');
    }

    if (search) {
      paramCount++;
      whereClause += ` AND (ca.description ILIKE $${paramCount} OR u.name ILIKE $${paramCount} OR ca.host_name ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    const query = `
      SELECT
        ca.id, ca.customer_id, ca.type, ca.description, ca.host_name,
        ca.duration_minutes, ca.metadata, ca.created_at,
        u.name as customer_name, u.email as customer_email
      FROM customer_activities ca
      LEFT JOIN users u ON ca.customer_id = u.id
      ${whereClause}
      ORDER BY ca.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get stats
    const statsQuery = `
      SELECT
        COUNT(*) as total_activities,
        COUNT(CASE WHEN ca.type IN ('call', 'video_call') THEN 1 END) as total_calls,
        COUNT(CASE WHEN ca.type = 'message' THEN 1 END) as total_messages,
        SUM(CASE WHEN ca.type IN ('call', 'video_call') THEN ca.duration_minutes ELSE 0 END) as total_minutes,
        COUNT(DISTINCT ca.customer_id) as active_customers
      FROM customer_activities ca
      LEFT JOIN users u ON ca.customer_id = u.id
      ${whereClause}
    `;

    const statsResult = await pool.query(statsQuery, queryParams.slice(0, -2));

    res.json({
      success: true,
      activities: result.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching customer activities:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get support tickets
app.get('/admin/support/tickets', async (req, res) => {
  try {
    const { status, priority, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const queryParams = [];
    let paramCount = 0;

    if (status && status !== 'all') {
      paramCount++;
      whereClause += ` AND st.status = $${paramCount}`;
      queryParams.push(status);
    }

    if (priority && priority !== 'all') {
      paramCount++;
      whereClause += ` AND st.priority = $${paramCount}`;
      queryParams.push(priority);
    }

    if (search) {
      paramCount++;
      whereClause += ` AND (st.subject ILIKE $${paramCount} OR st.description ILIKE $${paramCount} OR u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    const query = `
      SELECT
        st.id, st.ticket_number, st.customer_id, st.subject, st.description,
        st.priority, st.status, st.created_at, st.updated_at,
        u.name as customer_name, u.email as customer_email
      FROM support_tickets st
      LEFT JOIN users u ON st.customer_id = u.id
      ${whereClause}
      ORDER BY st.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get stats
    const statsQuery = `
      SELECT
        COUNT(*) as total_tickets,
        COUNT(CASE WHEN st.status = 'open' THEN 1 END) as open_tickets,
        COUNT(CASE WHEN st.status = 'resolved' THEN 1 END) as resolved_tickets,
        COUNT(CASE WHEN st.status = 'in_progress' THEN 1 END) as pending_tickets
      FROM support_tickets st
      LEFT JOIN users u ON st.customer_id = u.id
      ${whereClause}
    `;

    const statsResult = await pool.query(statsQuery, queryParams.slice(0, -2));

    res.json({
      success: true,
      tickets: result.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update ticket status
app.put('/admin/support/tickets/status/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body;

    const query = `
      UPDATE support_tickets
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [status, ticketId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    res.json({
      success: true,
      ticket: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Reply to ticket
app.post('/admin/support/tickets/reply/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message } = req.body;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Add reply to ticket_replies table
      const replyQuery = `
        INSERT INTO ticket_replies (ticket_id, sender_type, message, created_at)
        VALUES ($1, 'admin', $2, CURRENT_TIMESTAMP)
        RETURNING *
      `;

      await client.query(replyQuery, [ticketId, message]);

      // Update ticket status to in_progress if it was open
      const updateQuery = `
        UPDATE support_tickets
        SET status = CASE
          WHEN status = 'open' THEN 'in_progress'
          ELSE status
        END,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, [ticketId]);

      await client.query('COMMIT');

      res.json({
        success: true,
        ticket: updateResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error replying to ticket:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get ticket details
app.get('/admin/support/tickets/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticketQuery = `
      SELECT
        st.id, st.ticket_number, st.customer_id, st.subject, st.description,
        st.priority, st.status, st.created_at, st.updated_at,
        u.name as customer_name, u.email as customer_email
      FROM support_tickets st
      LEFT JOIN users u ON st.customer_id = u.id
      WHERE st.id = $1
    `;

    const ticketResult = await pool.query(ticketQuery, [ticketId]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Get ticket replies
    const repliesQuery = `
      SELECT id, sender_type, message, created_at
      FROM ticket_replies
      WHERE ticket_id = $1
      ORDER BY created_at ASC
    `;

    const repliesResult = await pool.query(repliesQuery, [ticketId]);

    res.json({
      success: true,
      ticket: {
        ...ticketResult.rows[0],
        replies: repliesResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching ticket details:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = app;
