// Host Profile and Data Endpoints
const { pool, upload, authenticateToken } = require('./production-server');

// ==================== HOST PROFILE ENDPOINTS ====================

// Get host profile
app.get('/api/hosts/:hostId/profile', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;

    // Verify the requesting user is the host or admin
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied' 
      });
    }

    const result = await pool.query(`
      SELECT h.*, hp.video_call_rate, hp.voice_call_rate, hp.message_rate, hp.streaming_rate
      FROM hosts h
      LEFT JOIN host_pricing hp ON h.id = hp.host_id
      WHERE h.id = $1
    `, [hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Host not found' 
      });
    }

    const host = result.rows[0];
    res.json({
      success: true,
      host: {
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
        languages: host.languages,
        profilePhotoUrl: host.profile_photo_url,
        isOnline: host.is_online,
        isLive: host.is_live,
        totalEarnings: parseFloat(host.total_earnings),
        totalCalls: host.total_calls,
        totalMinutes: host.total_minutes,
        rating: parseFloat(host.rating),
        pricing: {
          videoCallRate: parseFloat(host.video_call_rate),
          voiceCallRate: parseFloat(host.voice_call_rate),
          messageRate: parseFloat(host.message_rate),
          streamingRate: parseFloat(host.streaming_rate)
        }
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Update host profile
app.put('/api/hosts/:hostId/profile', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;
    const { name, phone, age, gender, city, state, bio, languages } = req.body;

    // Verify the requesting user is the host
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied' 
      });
    }

    // Build update query dynamically
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (name) {
      updateFields.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (phone) {
      updateFields.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    if (age) {
      updateFields.push(`age = $${paramCount++}`);
      values.push(age);
    }
    if (gender) {
      updateFields.push(`gender = $${paramCount++}`);
      values.push(gender);
    }
    if (city) {
      updateFields.push(`city = $${paramCount++}`);
      values.push(city);
    }
    if (state) {
      updateFields.push(`state = $${paramCount++}`);
      values.push(state);
    }
    if (bio) {
      updateFields.push(`bio = $${paramCount++}`);
      values.push(bio);
    }
    if (languages) {
      updateFields.push(`languages = $${paramCount++}`);
      values.push(languages);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No fields to update' 
      });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(hostId);

    const query = `
      UPDATE hosts 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, email, phone, age, gender, city, state, bio, languages, updated_at
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Host not found' 
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      host: result.rows[0]
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Upload profile photo
app.post('/api/hosts/:hostId/photo', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const { hostId } = req.params;

    // Verify the requesting user is the host
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No photo file uploaded' 
      });
    }

    const photoUrl = `/uploads/${req.file.filename}`;

    // Update host profile photo URL
    const result = await pool.query(`
      UPDATE hosts 
      SET profile_photo_url = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING profile_photo_url
    `, [photoUrl, hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Host not found' 
      });
    }

    res.json({
      success: true,
      message: 'Profile photo updated successfully',
      photoUrl: result.rows[0].profile_photo_url
    });

  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// ==================== HOST PRICING ENDPOINTS ====================

// Get host pricing
app.get('/host/pricing/:hostId', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;

    // Verify the requesting user is the host
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied' 
      });
    }

    const result = await pool.query(
      'SELECT * FROM host_pricing WHERE host_id = $1',
      [hostId]
    );

    if (result.rows.length === 0) {
      // Create default pricing if not exists
      await pool.query(`
        INSERT INTO host_pricing (host_id, video_call_rate, voice_call_rate, message_rate, streaming_rate)
        VALUES ($1, 150.00, 100.00, 5.00, 50.00)
      `, [hostId]);

      return res.json({
        success: true,
        pricing: {
          host_id: hostId,
          video_call_rate: 150.00,
          voice_call_rate: 100.00,
          message_rate: 5.00,
          streaming_rate: 50.00
        }
      });
    }

    const pricing = result.rows[0];
    res.json({
      success: true,
      pricing: {
        host_id: pricing.host_id,
        video_call_rate: parseFloat(pricing.video_call_rate),
        voice_call_rate: parseFloat(pricing.voice_call_rate),
        message_rate: parseFloat(pricing.message_rate),
        streaming_rate: parseFloat(pricing.streaming_rate),
        updated_at: pricing.updated_at
      }
    });

  } catch (error) {
    console.error('Get pricing error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Update host pricing
app.post('/host/pricing/:hostId', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;
    const { video_call_rate, voice_call_rate, message_rate, streaming_rate } = req.body;

    // Verify the requesting user is the host
    if (req.user.hostId !== parseInt(hostId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied' 
      });
    }

    const result = await pool.query(`
      INSERT INTO host_pricing (host_id, video_call_rate, voice_call_rate, message_rate, streaming_rate)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (host_id) 
      DO UPDATE SET 
        video_call_rate = EXCLUDED.video_call_rate,
        voice_call_rate = EXCLUDED.voice_call_rate,
        message_rate = EXCLUDED.message_rate,
        streaming_rate = EXCLUDED.streaming_rate,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [hostId, video_call_rate, voice_call_rate, message_rate, streaming_rate]);

    res.json({
      success: true,
      message: 'Pricing updated successfully',
      pricing: {
        host_id: result.rows[0].host_id,
        video_call_rate: parseFloat(result.rows[0].video_call_rate),
        voice_call_rate: parseFloat(result.rows[0].voice_call_rate),
        message_rate: parseFloat(result.rows[0].message_rate),
        streaming_rate: parseFloat(result.rows[0].streaming_rate),
        updated_at: result.rows[0].updated_at
      }
    });

  } catch (error) {
    console.error('Update pricing error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

module.exports = { app };
