const express = require('express');
const admin = require('firebase-admin');
const { Pool } = require('pg');
const multer = require('multer');
const sharp = require('sharp');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Firebase Admin
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'friendy-3d3d8.appspot.com'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const messageLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: 'Too many messages sent, please try again later.'
});

const uploadLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 uploads per 5 minutes
  message: 'Too many uploads, please try again later.'
});

// Multer for file uploads
const upload = multer({
  memory: true,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Send push notification
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  try {
    const message = {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data,
      android: {
        notification: {
          channelId: 'friendy_notifications',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default',
          },
        },
      },
    };

    await admin.messaging().send(message);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};

// Get user's FCM token
const getUserFCMToken = async (userId) => {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    return userDoc.data()?.fcmToken;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
};

// Routes

// Send message with notification
app.post('/api/messages/send', authenticateUser, messageLimit, async (req, res) => {
  try {
    const { conversationId, content, type = 'text' } = req.body;
    const senderId = req.user.uid;

    // Get conversation to find recipient
    const conversationRef = db.collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();
    
    if (!conversationDoc.exists) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const participants = conversationDoc.data().participants;
    const recipientId = participants.find(id => id !== senderId);

    // Create message
    const messageRef = conversationRef.collection('messages').doc();
    const messageData = {
      id: messageRef.id,
      senderId,
      content,
      type,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      readBy: [senderId],
    };

    // Use batch write
    const batch = db.batch();
    batch.set(messageRef, messageData);
    batch.update(conversationRef, {
      lastMessage: content,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageSenderId: senderId,
    });

    await batch.commit();

    // Send push notification to recipient
    const recipientFCMToken = await getUserFCMToken(recipientId);
    if (recipientFCMToken) {
      // Get sender's name
      const senderDoc = await db.collection('users').doc(senderId).get();
      const senderName = senderDoc.data()?.name || 'Someone';
      
      await sendPushNotification(
        recipientFCMToken,
        `New message from ${senderName}`,
        type === 'image' ? '📷 Photo' : content,
        {
          type: 'new_message',
          conversationId,
          senderId,
        }
      );
    }

    res.json({ success: true, messageId: messageRef.id });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Upload and send image
app.post('/api/messages/upload-image', authenticateUser, uploadLimit, upload.single('image'), async (req, res) => {
  try {
    const { conversationId } = req.body;
    const senderId = req.user.uid;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Compress image
    const compressedImage = await sharp(req.file.buffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Upload to Firebase Storage
    const fileName = `chat_images/${conversationId}/${Date.now()}_${req.file.originalname}`;
    const file = bucket.file(fileName);
    
    await file.save(compressedImage, {
      metadata: {
        contentType: 'image/jpeg',
      },
    });

    // Make file publicly readable
    await file.makePublic();
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // Send message with image URL
    const messageRef = db.collection('conversations').doc(conversationId).collection('messages').doc();
    const messageData = {
      id: messageRef.id,
      senderId,
      content: imageUrl,
      type: 'image',
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      readBy: [senderId],
    };

    await messageRef.set(messageData);

    // Update conversation
    await db.collection('conversations').doc(conversationId).update({
      lastMessage: '📷 Photo',
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageSenderId: senderId,
    });

    res.json({ success: true, imageUrl, messageId: messageRef.id });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Update FCM token
app.post('/api/users/fcm-token', authenticateUser, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user.uid;

    await db.collection('users').doc(userId).update({
      fcmToken,
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating FCM token:', error);
    res.status(500).json({ error: 'Failed to update FCM token' });
  }
});

// Report user
app.post('/api/users/report', authenticateUser, async (req, res) => {
  try {
    const { reportedUserId, reason, description } = req.body;
    const reporterId = req.user.uid;

    await db.collection('reports').add({
      reporterId,
      reportedUserId,
      reason,
      description,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error reporting user:', error);
    res.status(500).json({ error: 'Failed to report user' });
  }
});

// Get conversation analytics (admin only)
app.get('/api/admin/analytics/conversations', authenticateUser, async (req, res) => {
  try {
    // Check if user is admin
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.data()?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get conversation statistics
    const conversationsSnapshot = await db.collection('conversations').get();
    const totalConversations = conversationsSnapshot.size;

    // Get message statistics
    let totalMessages = 0;
    for (const doc of conversationsSnapshot.docs) {
      const messagesSnapshot = await doc.ref.collection('messages').get();
      totalMessages += messagesSnapshot.size;
    }

    res.json({
      totalConversations,
      totalMessages,
      averageMessagesPerConversation: totalMessages / totalConversations || 0,
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Messaging API server running on port ${port}`);
});
