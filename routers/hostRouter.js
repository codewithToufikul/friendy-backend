import { pool } from "../config/db.js";
import express from "express";

export const hostRoute = express.Router();

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