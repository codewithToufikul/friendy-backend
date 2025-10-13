// Host Media Management Endpoints
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/host-media';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `host-${req.params.hostId}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

// ==================== HOST MEDIA ENDPOINTS ====================

// Get host media
app.get('/api/hosts/:hostId/media', async (req, res) => {
  try {
    const { hostId } = req.params;
    
    console.log('📸 Getting media for host:', hostId);

    const result = await pool.query(`
      SELECT 
        id,
        media_url,
        media_type,
        is_primary,
        display_order,
        created_at
      FROM host_media 
      WHERE user_id = $1 
      ORDER BY is_primary DESC, display_order ASC, created_at DESC
    `, [hostId]);

    res.json({
      success: true,
      media: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Get host media error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get host media',
      error: error.message
    });
  }
});

// Upload host media
app.post('/api/hosts/:hostId/media/upload', upload.single('media'), async (req, res) => {
  try {
    const { hostId } = req.params;
    const { mediaType = 'image' } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No media file uploaded'
      });
    }

    console.log('📤 Uploading media for host:', hostId);

    const mediaUrl = `/uploads/host-media/${req.file.filename}`;
    
    // Get current media count to set display order
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM host_media WHERE user_id = $1',
      [hostId]
    );
    
    const displayOrder = parseInt(countResult.rows[0].count) + 1;
    
    // Check if this should be the primary media (first upload)
    const isPrimary = displayOrder === 1;

    const result = await pool.query(`
      INSERT INTO host_media (user_id, media_url, media_type, is_primary, display_order)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [hostId, mediaUrl, mediaType, isPrimary, displayOrder]);

    res.json({
      success: true,
      message: 'Media uploaded successfully',
      media: result.rows[0]
    });

  } catch (error) {
    console.error('Upload host media error:', error);
    
    // Clean up uploaded file if database operation failed
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to delete uploaded file:', err);
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload media',
      error: error.message
    });
  }
});

// Delete host media
app.delete('/api/hosts/:hostId/media/:mediaId', async (req, res) => {
  try {
    const { hostId, mediaId } = req.params;
    
    console.log('🗑️ Deleting media:', mediaId, 'for host:', hostId);

    // Get media info before deletion
    const mediaResult = await pool.query(
      'SELECT * FROM host_media WHERE id = $1 AND user_id = $2',
      [mediaId, hostId]
    );

    if (mediaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }

    const media = mediaResult.rows[0];
    
    // Delete from database
    await pool.query('DELETE FROM host_media WHERE id = $1', [mediaId]);

    // Delete file from filesystem
    const filePath = path.join(__dirname, '..', media.media_url);
    fs.unlink(filePath, (err) => {
      if (err) console.error('Failed to delete media file:', err);
    });

    // If this was the primary media, set another media as primary
    if (media.is_primary) {
      await pool.query(`
        UPDATE host_media 
        SET is_primary = true 
        WHERE user_id = $1 AND id = (
          SELECT id FROM host_media 
          WHERE user_id = $1 
          ORDER BY display_order ASC 
          LIMIT 1
        )
      `, [hostId]);
    }

    res.json({
      success: true,
      message: 'Media deleted successfully'
    });

  } catch (error) {
    console.error('Delete host media error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete media',
      error: error.message
    });
  }
});

// Set primary media
app.put('/api/hosts/:hostId/media/:mediaId/primary', async (req, res) => {
  try {
    const { hostId, mediaId } = req.params;
    
    console.log('⭐ Setting primary media:', mediaId, 'for host:', hostId);

    // First, remove primary status from all media for this host
    await pool.query(
      'UPDATE host_media SET is_primary = false WHERE user_id = $1',
      [hostId]
    );

    // Set the specified media as primary
    const result = await pool.query(`
      UPDATE host_media 
      SET is_primary = true 
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [mediaId, hostId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }

    res.json({
      success: true,
      message: 'Primary media updated successfully',
      media: result.rows[0]
    });

  } catch (error) {
    console.error('Set primary media error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set primary media',
      error: error.message
    });
  }
});

// Update media display order
app.put('/api/hosts/:hostId/media/reorder', async (req, res) => {
  try {
    const { hostId } = req.params;
    const { mediaOrder } = req.body; // Array of media IDs in desired order
    
    console.log('🔄 Reordering media for host:', hostId);

    if (!Array.isArray(mediaOrder)) {
      return res.status(400).json({
        success: false,
        message: 'Media order must be an array'
      });
    }

    // Update display order for each media item
    const updatePromises = mediaOrder.map((mediaId, index) => {
      return pool.query(
        'UPDATE host_media SET display_order = $1 WHERE id = $2 AND user_id = $3',
        [index + 1, mediaId, hostId]
      );
    });

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: 'Media order updated successfully'
    });

  } catch (error) {
    console.error('Reorder media error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder media',
      error: error.message
    });
  }
});

// Get media statistics
app.get('/api/hosts/:hostId/media/stats', async (req, res) => {
  try {
    const { hostId } = req.params;
    
    console.log('📊 Getting media stats for host:', hostId);

    const result = await pool.query(`
      SELECT 
        media_type,
        COUNT(*) as count,
        SUM(CASE WHEN is_primary THEN 1 ELSE 0 END) as primary_count
      FROM host_media 
      WHERE user_id = $1 
      GROUP BY media_type
    `, [hostId]);

    const stats = {
      total_media: 0,
      images: 0,
      videos: 0,
      primary_set: false
    };

    result.rows.forEach(row => {
      stats.total_media += parseInt(row.count);
      if (row.media_type === 'image') {
        stats.images = parseInt(row.count);
      } else if (row.media_type === 'video') {
        stats.videos = parseInt(row.count);
      }
      if (row.primary_count > 0) {
        stats.primary_set = true;
      }
    });

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Get media stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get media statistics',
      error: error.message
    });
  }
});

module.exports = app;
