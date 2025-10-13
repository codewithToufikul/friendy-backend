const express = require('express');
const cors = require('cors');

const app = express();
const port = 3000;

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Test server is running!' });
});

// Mock transactions endpoint
app.get('/transactions/:hostId', (req, res) => {
  const { hostId } = req.params;
  
  // Return mock transaction data
  const mockTransactions = [
    {
      id: 'txn_1',
      host_id: hostId,
      customer_id: 'cust_1',
      customer_name: 'Sarah Johnson',
      type: 'videoCall',
      amount: 150.00,
      duration: 15,
      rate: 10.00,
      timestamp: new Date().toISOString(),
      status: 'completed',
      description: 'Video call with Sarah Johnson'
    },
    {
      id: 'txn_2',
      host_id: hostId,
      customer_id: 'cust_2',
      customer_name: 'Emma Wilson',
      type: 'voiceCall',
      amount: 90.00,
      duration: 10,
      rate: 9.00,
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      status: 'completed',
      description: 'Voice call with Emma Wilson'
    },
    {
      id: 'txn_3',
      host_id: hostId,
      customer_id: 'cust_3',
      customer_name: 'Priya Sharma',
      type: 'message',
      amount: 5.00,
      duration: 0,
      rate: 5.00,
      timestamp: new Date(Date.now() - 172800000).toISOString(),
      status: 'completed',
      description: 'Message from Priya Sharma'
    },
    {
      id: 'txn_4',
      host_id: hostId,
      customer_id: 'admin',
      customer_name: 'Withdrawal',
      type: 'withdrawal',
      amount: -200.00,
      duration: 0,
      rate: 0,
      timestamp: new Date(Date.now() - 259200000).toISOString(),
      status: 'completed',
      description: 'Withdrawal to bank account'
    }
  ];
  
  res.json(mockTransactions);
});

// Mock earnings summary endpoint
app.get('/earnings-summary/:hostId', (req, res) => {
  const { hostId } = req.params;
  
  res.json({
    total_earnings: 1250.50,
    total_calls: 89,
    total_minutes: 1200,
    avg_earning: 14.05
  });
});

// Mock call requests endpoint
app.get('/call-requests/:hostId/pending', (req, res) => {
  const { hostId } = req.params;

  // Return empty array for now - no pending calls
  res.json([]);
});

// Mock update host profile endpoint
app.put('/api/hosts/:hostId/profile', (req, res) => {
  const { hostId } = req.params;
  const updateData = req.body;

  console.log(`📝 Updating profile for host ${hostId}:`, updateData);

  // Mock successful response
  res.json({
    success: true,
    message: 'Profile updated successfully',
    host: {
      id: hostId,
      ...updateData,
      updated_at: new Date().toISOString()
    }
  });
});

// Mock host pricing endpoints
app.get('/host/pricing/:hostId', (req, res) => {
  const { hostId } = req.params;

  console.log(`💰 Getting pricing for host ${hostId}`);

  // Mock pricing data
  res.json({
    success: true,
    pricing: {
      host_id: hostId,
      video_call_rate: 150,
      voice_call_rate: 100,
      message_rate: 5,
      streaming_rate: 50,
      updated_at: new Date().toISOString()
    }
  });
});

app.post('/host/pricing/:hostId', (req, res) => {
  const { hostId } = req.params;
  const pricingData = req.body;

  console.log(`💰 Saving pricing for host ${hostId}:`, pricingData);

  // Mock successful response
  res.json({
    success: true,
    message: 'Pricing updated successfully',
    pricing: {
      host_id: hostId,
      ...pricingData,
      updated_at: new Date().toISOString()
    }
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Test Friendy API server running on http://0.0.0.0:${port}`);
  console.log(`💸 Transactions API: http://localhost:${port}/transactions/:hostId`);
  console.log(`📊 Earnings API: http://localhost:${port}/earnings-summary/:hostId`);
  console.log(`📞 Call Requests API: http://localhost:${port}/call-requests/:hostId/pending`);
  console.log(`👤 Update Profile API: http://localhost:${port}/api/hosts/:hostId/profile`);
  console.log(`🔧 Health Check: http://localhost:${port}/health`);
  console.log('✅ Test server ready!');
});
