// Earnings and Transaction Endpoints
const { pool, authenticateToken } = require('./production-server');

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

    // Get call statistics
    const callStatsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_calls,
        COALESCE(SUM(duration_minutes), 0) as total_minutes,
        COALESCE(AVG(rating), 0) as average_rating
      FROM call_sessions 
      WHERE host_id = $1 AND status = 'completed'
    `, [hostId]);

    // Get streaming statistics
    const streamStatsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_streams,
        COALESCE(SUM(duration_minutes), 0) as total_stream_minutes,
        COALESCE(MAX(max_viewers), 0) as max_viewers_ever
      FROM streaming_sessions 
      WHERE host_id = $1 AND status = 'ended'
    `, [hostId]);

    const earnings = earningsResult.rows[0];
    const today = todayResult.rows[0];
    const week = weekResult.rows[0];
    const month = monthResult.rows[0];
    const callStats = callStatsResult.rows[0];
    const streamStats = streamStatsResult.rows[0];

    res.json({
      total_earnings: parseFloat(earnings.total_earnings),
      today_earnings: parseFloat(today.today_earnings),
      week_earnings: parseFloat(week.week_earnings),
      month_earnings: parseFloat(month.month_earnings),
      total_transactions: parseInt(earnings.total_transactions),
      total_calls: parseInt(callStats.total_calls),
      total_minutes: parseInt(callStats.total_minutes),
      total_streams: parseInt(streamStats.total_streams),
      total_stream_minutes: parseInt(streamStats.total_stream_minutes),
      average_rating: parseFloat(callStats.average_rating),
      max_viewers_ever: parseInt(streamStats.max_viewers_ever)
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

// ==================== CALL SESSION ENDPOINTS ====================

// Get call history
app.get('/call-sessions/:hostId', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Verify the requesting user is the host
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied' 
      });
    }

    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT 
        id,
        customer_name,
        call_type,
        start_time,
        end_time,
        duration_minutes,
        total_amount,
        rating,
        status
      FROM call_sessions 
      WHERE host_id = $1 
      ORDER BY start_time DESC
      LIMIT $2 OFFSET $3
    `, [hostId, limit, offset]);

    const callHistory = result.rows.map(row => ({
      id: row.id,
      customerName: row.customer_name,
      callType: row.call_type,
      callTime: row.start_time,
      duration: row.duration_minutes,
      earnings: parseFloat(row.total_amount),
      rating: row.rating,
      status: row.status
    }));

    res.json(callHistory);

  } catch (error) {
    console.error('Call history error:', error);
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

// Accept call request
app.post('/call-sessions/:sessionId/accept', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { channelName } = req.body;

    // Get call session details
    const sessionResult = await pool.query(
      'SELECT * FROM call_sessions WHERE id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Call session not found' 
      });
    }

    const session = sessionResult.rows[0];

    // Verify the requesting user is the host
    if (req.user.hostId !== session.host_id) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied' 
      });
    }

    // Update session status to active
    await pool.query(`
      UPDATE call_sessions 
      SET status = 'active', channel_name = $1, start_time = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [channelName, sessionId]);

    res.json({
      success: true,
      message: 'Call request accepted',
      sessionId: sessionId,
      channelName: channelName
    });

  } catch (error) {
    console.error('Accept call error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// End call session
app.post('/call-sessions/:sessionId/end', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { durationMinutes, rating } = req.body;

    // Get call session details
    const sessionResult = await pool.query(
      'SELECT * FROM call_sessions WHERE id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Call session not found' 
      });
    }

    const session = sessionResult.rows[0];

    // Verify the requesting user is the host
    if (req.user.hostId !== session.host_id) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied' 
      });
    }

    // Calculate total amount
    const totalAmount = durationMinutes * parseFloat(session.rate_per_minute);

    // Update session
    await pool.query(`
      UPDATE call_sessions 
      SET 
        status = 'completed',
        end_time = CURRENT_TIMESTAMP,
        duration_minutes = $1,
        total_amount = $2,
        rating = $3
      WHERE id = $4
    `, [durationMinutes, totalAmount, rating, sessionId]);

    // Create transaction record
    await pool.query(`
      INSERT INTO transactions (host_id, transaction_type, reference_id, amount, description, status)
      VALUES ($1, 'call', $2, $3, $4, 'completed')
    `, [
      session.host_id,
      sessionId,
      totalAmount,
      `${session.call_type} call with ${session.customer_name} (${durationMinutes} minutes)`
    ]);

    // Update host statistics
    await pool.query(`
      UPDATE hosts 
      SET 
        total_earnings = total_earnings + $1,
        total_calls = total_calls + 1,
        total_minutes = total_minutes + $2
      WHERE id = $3
    `, [totalAmount, durationMinutes, session.host_id]);

    res.json({
      success: true,
      message: 'Call ended successfully',
      earnings: totalAmount,
      duration: durationMinutes
    });

  } catch (error) {
    console.error('End call error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

module.exports = { app };
