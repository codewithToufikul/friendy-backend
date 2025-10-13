// Admin Host Management Endpoints
const express = require('express');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const app = express();

// ==================== BULK OPERATIONS ====================

// Bulk update pricing for multiple hosts
app.post('/admin/hosts/bulk-pricing', async (req, res) => {
  try {
    const { hostIds, pricing } = req.body;
    
    if (!hostIds || !Array.isArray(hostIds) || hostIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Host IDs array is required'
      });
    }

    console.log('🔄 Bulk updating pricing for hosts:', hostIds);
    
    // Build update query dynamically based on provided pricing fields
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (pricing.video_call_rate !== undefined && pricing.video_call_rate !== '') {
      updateFields.push(`video_call_rate = $${paramCount++}`);
      values.push(parseFloat(pricing.video_call_rate));
    }
    
    if (pricing.voice_call_rate !== undefined && pricing.voice_call_rate !== '') {
      updateFields.push(`voice_call_rate = $${paramCount++}`);
      values.push(parseFloat(pricing.voice_call_rate));
    }
    
    if (pricing.message_rate !== undefined && pricing.message_rate !== '') {
      updateFields.push(`message_rate = $${paramCount++}`);
      values.push(parseFloat(pricing.message_rate));
    }
    
    if (pricing.streaming_rate !== undefined && pricing.streaming_rate !== '') {
      updateFields.push(`streaming_rate = $${paramCount++}`);
      values.push(parseFloat(pricing.streaming_rate));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pricing fields provided for update'
      });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    
    // Create placeholders for host IDs
    const hostIdPlaceholders = hostIds.map((_, index) => `$${paramCount + index}`).join(',');
    values.push(...hostIds);

    const query = `
      UPDATE host_pricing 
      SET ${updateFields.join(', ')}
      WHERE host_id IN (${hostIdPlaceholders})
      RETURNING *
    `;

    const result = await pool.query(query, values);

    // For hosts that don't have pricing records, create them
    const updatedHostIds = result.rows.map(row => row.host_id);
    const missingHostIds = hostIds.filter(id => !updatedHostIds.includes(parseInt(id)));
    
    if (missingHostIds.length > 0) {
      const insertValues = missingHostIds.map(hostId => {
        return `(${hostId}, ${pricing.video_call_rate || 150}, ${pricing.voice_call_rate || 100}, ${pricing.message_rate || 5}, ${pricing.streaming_rate || 50})`;
      }).join(',');
      
      await pool.query(`
        INSERT INTO host_pricing (host_id, video_call_rate, voice_call_rate, message_rate, streaming_rate)
        VALUES ${insertValues}
      `);
    }

    res.json({
      success: true,
      message: `Pricing updated for ${hostIds.length} hosts`,
      updated_count: result.rows.length + missingHostIds.length
    });

  } catch (error) {
    console.error('Bulk pricing update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update bulk pricing',
      error: error.message
    });
  }
});

// ==================== HOST ANALYTICS ====================

// Get host analytics
app.get('/admin/hosts/analytics/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    const { startDate, endDate } = req.query;

    console.log('📊 Getting analytics for host:', hostId);

    // Build date filter
    let dateFilter = '';
    const queryParams = [hostId];
    let paramCount = 2;

    if (startDate && endDate) {
      dateFilter = `AND created_at BETWEEN $${paramCount} AND $${paramCount + 1}`;
      queryParams.push(startDate, endDate);
      paramCount += 2;
    }

    // Get call statistics
    const callStatsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_calls,
        COALESCE(SUM(duration_minutes), 0) as total_minutes,
        COALESCE(AVG(duration_minutes), 0) as avg_call_duration,
        COALESCE(AVG(rating), 0) as avg_rating,
        COUNT(DISTINCT customer_id) as unique_customers
      FROM call_sessions 
      WHERE host_id = $1 AND status = 'completed' ${dateFilter}
    `, queryParams);

    // Get earnings breakdown
    const earningsResult = await pool.query(`
      SELECT 
        transaction_type,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(*) as transaction_count
      FROM transactions 
      WHERE host_id = $1 AND status = 'completed' ${dateFilter}
      GROUP BY transaction_type
    `, queryParams);

    // Get streaming statistics
    const streamStatsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_streams,
        COALESCE(SUM(duration_minutes), 0) as total_stream_minutes,
        COALESCE(AVG(viewer_count), 0) as avg_viewers,
        COALESCE(MAX(max_viewers), 0) as max_viewers
      FROM streaming_sessions 
      WHERE host_id = $1 AND status = 'ended' ${dateFilter}
    `, queryParams);

    // Process earnings breakdown
    const earningsBreakdown = {
      video_earnings: 0,
      voice_earnings: 0,
      message_earnings: 0,
      streaming_earnings: 0
    };

    earningsResult.rows.forEach(row => {
      switch (row.transaction_type) {
        case 'video_call':
          earningsBreakdown.video_earnings = parseFloat(row.total_amount);
          break;
        case 'voice_call':
          earningsBreakdown.voice_earnings = parseFloat(row.total_amount);
          break;
        case 'message':
          earningsBreakdown.message_earnings = parseFloat(row.total_amount);
          break;
        case 'streaming':
          earningsBreakdown.streaming_earnings = parseFloat(row.total_amount);
          break;
      }
    });

    const callStats = callStatsResult.rows[0];
    const streamStats = streamStatsResult.rows[0];

    // Calculate repeat customers
    const repeatCustomersResult = await pool.query(`
      SELECT COUNT(*) as repeat_customers
      FROM (
        SELECT customer_id, COUNT(*) as call_count
        FROM call_sessions 
        WHERE host_id = $1 AND status = 'completed' ${dateFilter}
        GROUP BY customer_id
        HAVING COUNT(*) > 1
      ) repeat_calls
    `, queryParams);

    res.json({
      success: true,
      analytics: {
        // Call metrics
        total_calls: parseInt(callStats.total_calls),
        total_minutes: parseInt(callStats.total_minutes),
        avg_call_duration: parseFloat(callStats.avg_call_duration).toFixed(2),
        avg_rating: parseFloat(callStats.avg_rating).toFixed(2),
        
        // Customer metrics
        unique_customers: parseInt(callStats.unique_customers),
        repeat_customers: parseInt(repeatCustomersResult.rows[0].repeat_customers),
        
        // Earnings breakdown
        ...earningsBreakdown,
        
        // Streaming metrics
        total_streams: parseInt(streamStats.total_streams),
        total_stream_minutes: parseInt(streamStats.total_stream_minutes),
        avg_viewers: parseFloat(streamStats.avg_viewers).toFixed(2),
        max_viewers: parseInt(streamStats.max_viewers)
      }
    });

  } catch (error) {
    console.error('Get host analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get host analytics',
      error: error.message
    });
  }
});

// ==================== BULK OPERATIONS ====================

// General bulk operations endpoint
app.post('/admin/hosts/bulk', async (req, res) => {
  try {
    const { operation, hostIds, data } = req.body;

    if (!hostIds || !Array.isArray(hostIds) || hostIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Host IDs array is required'
      });
    }

    console.log(`🔄 Performing bulk operation '${operation}' on hosts:`, hostIds);

    let result;
    let message;

    switch (operation) {
      case 'approve':
        result = await pool.query(`
          UPDATE hosts 
          SET is_verified = true, updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1)
          RETURNING id, name
        `, [hostIds]);
        message = `Approved ${result.rows.length} hosts`;
        break;

      case 'reject':
        result = await pool.query(`
          UPDATE hosts 
          SET is_verified = false, updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1)
          RETURNING id, name
        `, [hostIds]);
        message = `Rejected ${result.rows.length} hosts`;
        break;

      case 'set_vip':
        result = await pool.query(`
          UPDATE hosts 
          SET is_vip = $2, vip_status = $3, updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1)
          RETURNING id, name
        `, [hostIds, data.is_vip || true, data.vip_status || 'regular']);
        message = `Updated VIP status for ${result.rows.length} hosts`;
        break;

      case 'set_online':
        result = await pool.query(`
          UPDATE hosts 
          SET is_online = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1)
          RETURNING id, name
        `, [hostIds, data.is_online || true]);
        message = `Updated online status for ${result.rows.length} hosts`;
        break;

      case 'delete':
        result = await pool.query(`
          DELETE FROM hosts 
          WHERE id = ANY($1)
          RETURNING id, name
        `, [hostIds]);
        message = `Deleted ${result.rows.length} hosts`;
        break;

      default:
        return res.status(400).json({
          success: false,
          message: `Unknown operation: ${operation}`
        });
    }

    res.json({
      success: true,
      message,
      affected_hosts: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Bulk operation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform bulk operation',
      error: error.message
    });
  }
});

module.exports = app;
