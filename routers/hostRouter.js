import bcryptjs from "bcryptjs";
import { pool } from "../config/db.js";
import express from "express";
import jwt from "jsonwebtoken"

export const hostRoute = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'friendy_host_app_secret_key_2024';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

hostRoute.get('/get-all', async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    let query = `
      SELECT *,
        CASE
          WHEN is_vip = true AND online_status = 'online' THEN 100
          WHEN is_vip = true AND live_status = 'live' THEN 90
          WHEN is_vip = true AND busy_status = 'busy' THEN 80
          WHEN live_status = 'live' THEN 70
          WHEN busy_status = 'busy' THEN 60
          WHEN online_status = 'online' THEN 50
          ELSE 0
        END as calculated_priority
      FROM users
      WHERE role = 'host' AND is_host_approved = true
    `;

    // Add status filter if provided
    if (status) {
      switch (status) {
        case 'vip':
          query += ` AND is_vip = true`;
          break;
        case 'online':
          query += ` AND online_status = 'online'`;
          break;
        case 'live':
          query += ` AND live_status = 'live'`;
          break;
        case 'busy':
          query += ` AND busy_status = 'busy'`;
          break;
      }
    }

    query += ` ORDER BY calculated_priority DESC, host_rating DESC, created_at DESC LIMIT $1 OFFSET $2`;

    const result = await pool.query(query, [limit, offset]);

    res.json({
      success: true,
      hosts: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching hosts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hosts',
      error: error.message
    });
  }
});

// Host Registration
// hostRoute.post('/auth/register', async (req, res) => {
//   try {
//     const { name, email, password, phone, age, gender, city, state, bio, languages } = req.body;

//     // Validate required fields
//     if (!name || !email || !password) {
//       return res.status(400).json({
//         success: false,
//         error: 'Name, email, and password are required'
//       });
//     }

//     // Check if host already exists
//     const existingHost = await pool.query(
//       'SELECT id FROM hosts WHERE email = $1',
//       [email]
//     );

//     if (existingHost.rows.length > 0) {
//       return res.status(400).json({
//         success: false,
//         error: 'Host with this email already exists'
//       });
//     }

//     // Hash password
//     const saltRounds = 12;
//     const passwordHash = await bcryptjs.hash(password, saltRounds);

//     // Insert new host (is_verified defaults to false for new registrations)
//     const result = await pool.query(`
//       INSERT INTO users (name, email, password_hash, phone, age, gender, city, state, host_bio, languages, is_host_approved, login_type)
//       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, "quick")
//       RETURNING id, name, email, phone, age, gender, city, state, host_bio, languages, is_host_approved, created_at
//     `, [name, email, passwordHash, phone, age, gender, city, state, bio, languages]);

//     const newHost = result.rows[0];

//     // Create default pricing for the host
//     await pool.query(`
//       INSERT INTO host_pricing (host_id, video_call_rate, voice_call_rate, message_rate, streaming_rate)
//       VALUES ($1, 150.00, 100.00, 5.00, 50.00)
//     `, [newHost.id]);

//     // Generate JWT token
//     const token = jwt.sign(
//       { hostId: newHost.id, email: newHost.email },
//       JWT_SECRET,
//       { expiresIn: '7d' }
//     );

//     res.status(201).json({
//       success: true,
//       message: 'Host registered successfully',
//       user: {
//         id: newHost.id,
//         name: newHost.name,
//         email: newHost.email,
//         phone: newHost.phone,
//         age: newHost.age,
//         gender: newHost.gender,
//         city: newHost.city,
//         state: newHost.state,
//         bio: newHost.bio,
//         languages: newHost.languages,
//         isVerified: newHost.is_verified,
//         isOnline: false,
//         totalEarnings: 0,
//         totalCalls: 0,
//         rating: 0,
//         createdAt: newHost.created_at
//       },
//       token
//     });

//   } catch (error) {
//     console.error('Registration error:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Internal server error during registration'
//     });
//   }
// });

hostRoute.post('/auth/register', async (req, res) => {
  try {
    console.log('📝 Host registration request received');
    console.log('📝 Request body:', req.body);
    console.log('📝 Database pool status:', pool.totalCount, 'total connections');

    const { name, email, password, phone, age, gender, city, bio, state, country, languages } = req.body;

    // Validate required fields
    if (!name || !email || !password || !phone || !age || !gender || !city || !bio) {
      console.log('❌ Validation failed - missing fields');
      return res.status(400).json({
        success: false,
        message: 'All fields are required: name, email, password, phone, age, gender, city, bio'
      });
    }

    console.log('✅ Validation passed, hashing password...');
    // Hash password
    const hashedPassword = await bcryptjs.hash(password, 10);

    console.log('💾 Inserting into database...');
    // Insert host into users table
    const result = await pool.query(`
      INSERT INTO users (
        name, email, password_hash, phone, age, gender, city, state, country,
        role, host_bio, host_languages, is_host_approved, login_type, profile_completed, is_approved,
        video_call_rate, voice_call_rate, message_rate, host_rating
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 'host', $10, $11, false, 'email', true, true, 50.0, 30.0, 10.0, 4.5
      ) RETURNING id, name, email, is_host_approved
    `, [name, email, hashedPassword, phone, age, gender, city, state || 'Maharashtra', country || 'India', bio, languages || ['Hindi', 'English']]);

    console.log('✅ Database insert successful:', result.rows[0]);
    const host = result.rows[0];

    res.json({
      success: true,
      message: 'Host registration submitted for approval',
      host: {
        id: host.id,
        name: host.name,
        email: host.email,
        is_verified: host.is_host_approved
      }
    });
  } catch (error) {
    console.error('❌ Host registration error:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error code:', error.code);

    if (error.code === '23505') { // Unique violation
      res.status(400).json({ success: false, message: 'Email already registered' });
    } else {
      res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
    }
  }
});


hostRoute.post('/auth/login', async (req, res) => {
  try {
    console.log('Host login request:', req.body);
    const { email, password } = req.body;

    // Find host in users table
    const result = await pool.query(`
      SELECT * FROM users
      WHERE email = $1 AND role = 'host'
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const host = result.rows[0];

    // Check password
    const validPassword = await bcryptjs.compare(password, host.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if approved
    if (!host.is_host_approved) {
      return res.status(403).json({
        success: false,
        message: 'Account pending approval',
        pending: true
      });
    }

    const token = jwt.sign({ id: host.id, email: host.email, type: 'host' }, JWT_SECRET);

    res.json({
      data:{
      success: true,
      message: 'Login successful',
      host: {
        id: host.id,
        name: host.name,
        email: host.email,
        is_verified: host.is_host_approved,
        online_status: host.online_status,
        busy_status: host.busy_status,
        live_status: host.live_status,
        video_call_rate: host.video_call_rate,
        voice_call_rate: host.voice_call_rate
      },
      token: token
    }
    });
  } catch (error) {
    console.error('Host login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// ==================== HOST PROFILE ENDPOINTS ====================

hostRoute.get('/:hostId/profile', authenticateToken, async (req, res) => {
  try {
    const { hostId } = req.params;

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Host not found' });
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
        bio: host.host_bio,
        profile_image: host.profile_image,
        is_verified: host.is_host_approved,
        is_online: host.online_status,
        total_earnings: parseFloat(host.total_earnings || 0),
        rating: parseFloat(host.host_rating || 0)
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
});


