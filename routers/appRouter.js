import express from 'express';
import bcrypt from 'bcrypt'
import { pool } from '../config/db.js';
import jwt from 'jsonwebtoken';

 export const userRouter = express.Router();

 const JWT_SECRET = process.env.JWT_SECRET || 'friendy_host_app_secret_key_2024';


 userRouter.post('/auth/quick-login', async (req, res) => {
   try {
     console.log('🚀 Quick login request:', req.body);
     const { deviceId, name, age, gender } = req.body;
 
     if (!deviceId || !name) {
       return res.status(400).json({ success: false, message: 'Device ID and name are required' });
     }
 
     // Check if device already used quick login
     const existingUser = await pool.query('SELECT * FROM users WHERE device_id = $1', [deviceId]);
 
     if (existingUser.rows.length > 0) {
       const user = existingUser.rows[0];
 
       // Update last login
       await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
 
       // Generate JWT token
       const token = jwt.sign({ userId: user.id, loginType: 'quick' }, JWT_SECRET || 'friendy_secret', { expiresIn: '30d' });
 
       return res.json({
        success: true,
        data:
        {
         success: true,
         message: 'Quick login successful',
         user: {
           id: user.id,
           name: user.name,
           email: user.email,
           age: user.age,
           gender: user.gender,
           city: user.city,
           state: user.state,
           country: user.country,
           phone: user.phone,
           profile_image: user.profile_image,
           profile_photo_url: user.profile_photo_url,
           loginType: user.login_type,
           coinsBalance: user.coins_balance,
           coins: user.coins,
           is_active: user.is_active,
           is_online: user.is_online,
           is_approved: user.is_approved,
           approval_status: user.approval_status,
           profile_completed: user.profile_completed,
           role: user.role,
           languages: user.languages,
           created_at: user.created_at,
           updated_at: user.updated_at,
           last_login: user.last_login
         },
         token: token
       }
       });
     }
 
     // Create new user with quick login
     const result = await pool.query(
       'INSERT INTO users (name, age, gender, device_id, login_type, is_quick_login_used) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
       [name, age || 18, gender || 'male', deviceId, 'quick', true]
     );
 
     const newUser = result.rows[0];
 
     // Generate JWT token
     const token = jwt.sign({ userId: newUser.id, loginType: 'quick' }, JWT_SECRET|| 'friendy_secret', { expiresIn: '30d' });
 
     res.json({
      success: true,
    data:{
       success: true,
       message: 'Quick login account created successfully',
       user: {
         id: newUser.id,
         name: newUser.name,
         email: newUser.email,
         age: newUser.age,
         gender: newUser.gender,
         city: newUser.city,
         state: newUser.state,
         country: newUser.country,
         phone: newUser.phone,
         profile_image: newUser.profile_image,
         profile_photo_url: newUser.profile_photo_url,
         loginType: newUser.login_type,
         coinsBalance: newUser.coins_balance,
         coins: newUser.coins,
         is_active: newUser.is_active,
         is_online: newUser.is_online,
         is_approved: newUser.is_approved,
         approval_status: newUser.approval_status,
         profile_completed: newUser.profile_completed,
         role: newUser.role,
         languages: newUser.languages,
         created_at: newUser.created_at,
         updated_at: newUser.updated_at,
         last_login: newUser.last_login
       },
       token: token
     }
     });
   } catch (error) {
     console.error('Quick login error:', error);
     console.error('Error details:', error.message);
     console.error('Error stack:', error.stack);
     res.status(500).json({
       success: false,
       message: 'Quick login failed',
       error: error.message,
       details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     });
   }
 });

// Sign up (migrated from server.js)
userRouter.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name, age, gender, country } = req.body;
    console.log(email, password, name, age, gender, country)
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, age, gender, country, coins, login_type, is_approved, approval_status, profile_completed, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [email.toLowerCase(), hashedPassword, name, 'user', age, gender, country, 0, 'email' , false, 'pending', false]
    );

    const user = result.rows[0];
    console.log(user)
    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        age: user.age,
        gender: user.gender,
        location: user.location,
        coins: user.coins,
        is_approved: user.is_approved,
        approval_status: user.approval_status,
        profile_completed: user.profile_completed,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Sign up error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


userRouter.post('/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(email, password)
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, email, name, password_hash, coins, is_vip, role, created_at FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'No account found with this email' });
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    await pool.query('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // ✅ Create JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' } // token 7 দিনের জন্য valid
    );
    // ✅ Send token along with user info
    return res.status(200).json({
      success: true,
      data: {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          coins: user.coins,
          is_vip: user.is_vip,
          created_at: user.created_at,
        },
      },
      status: 200,
      url: '/user/auth/signin',
    });

  } catch (error) {
    console.error('Signin error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

 
