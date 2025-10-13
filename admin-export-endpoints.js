// Admin Export and Search Endpoints
const express = require('express');
const { Pool } = require('pg');
const json2csv = require('json2csv').parse;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const app = express();

// ==================== DATA EXPORT ====================

// Export host data
app.post('/admin/hosts/export', async (req, res) => {
  try {
    const { format = 'csv', filters = {} } = req.body;
    
    console.log('📤 Exporting host data in format:', format);
    console.log('📋 Export filters:', filters);

    // Build query based on filters
    let query = `
      SELECT 
        h.id,
        h.name,
        h.email,
        h.phone,
        h.age,
        h.gender,
        h.city,
        h.state,
        h.country,
        h.bio,
        h.is_online,
        h.is_live,
        h.is_verified,
        h.total_earnings,
        h.total_calls,
        h.total_minutes,
        h.rating,
        h.created_at,
        h.updated_at,
        hp.video_call_rate,
        hp.voice_call_rate,
        hp.message_rate,
        hp.streaming_rate
      FROM hosts h
      LEFT JOIN host_pricing hp ON h.id = hp.host_id
    `;

    const queryParams = [];
    const whereConditions = [];
    let paramCount = 1;

    // Apply filters
    if (filters.hostId) {
      whereConditions.push(`h.id = $${paramCount++}`);
      queryParams.push(filters.hostId);
    }

    if (filters.startDate && filters.endDate) {
      whereConditions.push(`h.created_at BETWEEN $${paramCount++} AND $${paramCount++}`);
      queryParams.push(filters.startDate, filters.endDate);
    }

    if (filters.isVerified !== undefined) {
      whereConditions.push(`h.is_verified = $${paramCount++}`);
      queryParams.push(filters.isVerified);
    }

    if (filters.isVip !== undefined) {
      whereConditions.push(`h.is_vip = $${paramCount++}`);
      queryParams.push(filters.isVip);
    }

    if (filters.gender) {
      whereConditions.push(`h.gender = $${paramCount++}`);
      queryParams.push(filters.gender);
    }

    if (filters.city) {
      whereConditions.push(`h.city ILIKE $${paramCount++}`);
      queryParams.push(`%${filters.city}%`);
    }

    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    query += ` ORDER BY h.created_at DESC`;

    const result = await pool.query(query, queryParams);

    if (format === 'csv') {
      // Convert to CSV
      const fields = [
        'id', 'name', 'email', 'phone', 'age', 'gender', 'city', 'state', 'country',
        'bio', 'is_online', 'is_live', 'is_verified', 'total_earnings', 'total_calls',
        'total_minutes', 'rating', 'created_at', 'updated_at', 'video_call_rate',
        'voice_call_rate', 'message_rate', 'streaming_rate'
      ];

      const csv = json2csv(result.rows, { fields });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="hosts_export.csv"');
      res.send(csv);
    } else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="hosts_export.json"');
      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length,
        exported_at: new Date().toISOString()
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported export format. Use csv or json.'
      });
    }

  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export data',
      error: error.message
    });
  }
});

// Export earnings data
app.post('/admin/hosts/export-earnings', async (req, res) => {
  try {
    const { format = 'csv', filters = {} } = req.body;
    
    console.log('💰 Exporting earnings data in format:', format);

    let query = `
      SELECT 
        h.id as host_id,
        h.name as host_name,
        h.email as host_email,
        t.transaction_type,
        t.amount,
        t.status,
        t.created_at,
        cs.call_type,
        cs.duration_minutes,
        cs.customer_name
      FROM hosts h
      LEFT JOIN transactions t ON h.id = t.host_id
      LEFT JOIN call_sessions cs ON t.session_id = cs.id
    `;

    const queryParams = [];
    const whereConditions = [];
    let paramCount = 1;

    if (filters.hostId) {
      whereConditions.push(`h.id = $${paramCount++}`);
      queryParams.push(filters.hostId);
    }

    if (filters.startDate && filters.endDate) {
      whereConditions.push(`t.created_at BETWEEN $${paramCount++} AND $${paramCount++}`);
      queryParams.push(filters.startDate, filters.endDate);
    }

    if (filters.type) {
      whereConditions.push(`t.transaction_type = $${paramCount++}`);
      queryParams.push(filters.type);
    }

    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    query += ` ORDER BY t.created_at DESC`;

    const result = await pool.query(query, queryParams);

    if (format === 'csv') {
      const fields = [
        'host_id', 'host_name', 'host_email', 'transaction_type', 'amount',
        'status', 'created_at', 'call_type', 'duration_minutes', 'customer_name'
      ];

      const csv = json2csv(result.rows, { fields });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="earnings_export.csv"');
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="earnings_export.json"');
      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length,
        exported_at: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Export earnings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export earnings data',
      error: error.message
    });
  }
});

// ==================== ADVANCED SEARCH ====================

// Advanced search for hosts
app.post('/admin/hosts/search', async (req, res) => {
  try {
    const { searchCriteria } = req.body;
    
    console.log('🔍 Advanced search with criteria:', searchCriteria);

    let query = `
      SELECT 
        h.*,
        hp.video_call_rate,
        hp.voice_call_rate,
        hp.message_rate,
        hp.streaming_rate,
        COUNT(cs.id) as total_calls_count,
        COALESCE(AVG(cs.rating), 0) as avg_rating,
        COALESCE(SUM(t.amount), 0) as total_earnings_calculated
      FROM hosts h
      LEFT JOIN host_pricing hp ON h.id = hp.host_id
      LEFT JOIN call_sessions cs ON h.id = cs.host_id
      LEFT JOIN transactions t ON h.id = t.host_id AND t.status = 'completed'
    `;

    const queryParams = [];
    const whereConditions = [];
    let paramCount = 1;

    // Text search
    if (searchCriteria.text) {
      whereConditions.push(`(
        h.name ILIKE $${paramCount} OR 
        h.email ILIKE $${paramCount} OR 
        h.bio ILIKE $${paramCount}
      )`);
      queryParams.push(`%${searchCriteria.text}%`);
      paramCount++;
    }

    // Age range
    if (searchCriteria.minAge) {
      whereConditions.push(`h.age >= $${paramCount++}`);
      queryParams.push(searchCriteria.minAge);
    }
    if (searchCriteria.maxAge) {
      whereConditions.push(`h.age <= $${paramCount++}`);
      queryParams.push(searchCriteria.maxAge);
    }

    // Gender filter
    if (searchCriteria.gender) {
      whereConditions.push(`h.gender = $${paramCount++}`);
      queryParams.push(searchCriteria.gender);
    }

    // Location filter
    if (searchCriteria.city) {
      whereConditions.push(`h.city ILIKE $${paramCount++}`);
      queryParams.push(`%${searchCriteria.city}%`);
    }

    // Status filters
    if (searchCriteria.isVerified !== undefined) {
      whereConditions.push(`h.is_verified = $${paramCount++}`);
      queryParams.push(searchCriteria.isVerified);
    }

    if (searchCriteria.isOnline !== undefined) {
      whereConditions.push(`h.is_online = $${paramCount++}`);
      queryParams.push(searchCriteria.isOnline);
    }

    if (searchCriteria.isVip !== undefined) {
      whereConditions.push(`h.is_vip = $${paramCount++}`);
      queryParams.push(searchCriteria.isVip);
    }

    // Earnings range
    if (searchCriteria.minEarnings) {
      whereConditions.push(`h.total_earnings >= $${paramCount++}`);
      queryParams.push(searchCriteria.minEarnings);
    }
    if (searchCriteria.maxEarnings) {
      whereConditions.push(`h.total_earnings <= $${paramCount++}`);
      queryParams.push(searchCriteria.maxEarnings);
    }

    // Rating range
    if (searchCriteria.minRating) {
      whereConditions.push(`h.rating >= $${paramCount++}`);
      queryParams.push(searchCriteria.minRating);
    }

    // Date range
    if (searchCriteria.startDate && searchCriteria.endDate) {
      whereConditions.push(`h.created_at BETWEEN $${paramCount++} AND $${paramCount++}`);
      queryParams.push(searchCriteria.startDate, searchCriteria.endDate);
    }

    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    query += ` GROUP BY h.id, hp.video_call_rate, hp.voice_call_rate, hp.message_rate, hp.streaming_rate`;

    // Sorting
    const sortBy = searchCriteria.sortBy || 'created_at';
    const sortOrder = searchCriteria.sortOrder || 'DESC';
    query += ` ORDER BY ${sortBy} ${sortOrder}`;

    // Pagination
    const page = searchCriteria.page || 1;
    const limit = searchCriteria.limit || 20;
    const offset = (page - 1) * limit;
    
    query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT h.id) as total
      FROM hosts h
      LEFT JOIN host_pricing hp ON h.id = hp.host_id
      LEFT JOIN call_sessions cs ON h.id = cs.host_id
      LEFT JOIN transactions t ON h.id = t.host_id AND t.status = 'completed'
    `;

    if (whereConditions.length > 0) {
      countQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    const countResult = await pool.query(countQuery, queryParams.slice(0, -2)); // Remove limit and offset

    res.json({
      success: true,
      hosts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      },
      search_criteria: searchCriteria
    });

  } catch (error) {
    console.error('Advanced search error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform advanced search',
      error: error.message
    });
  }
});

module.exports = app;
