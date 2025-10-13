const express = require('express');
const cors = require('cors');

const app = express();
const port = 3001;

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8080',
    'https://friendy-admin.vercel.app',
    'https://*.vercel.app'
  ],
  credentials: true
}));

app.use(express.json());

// Test data
const testData = {
  hosts: [
    {
      id: '1',
      name: 'Priya Sharma',
      email: 'priya@example.com',
      age: 25,
      gender: 'female',
      city: 'Mumbai',
      is_verified: true,
      created_at: new Date().toISOString()
    },
    {
      id: '2',
      name: 'Rahul Kumar',
      email: 'rahul@example.com',
      age: 28,
      gender: 'male',
      city: 'Delhi',
      is_verified: false,
      created_at: new Date().toISOString()
    }
  ],
  customers: [
    { id: '1', name: 'Customer 1' },
    { id: '2', name: 'Customer 2' },
    { id: '3', name: 'Customer 3' }
  ]
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Test admin server running' });
});

// Admin dashboard stats
app.get('/admin/dashboard', (req, res) => {
  console.log('📊 Dashboard endpoint called');
  
  const stats = {
    total_hosts: testData.hosts.length,
    pending_hosts: testData.hosts.filter(h => !h.is_verified).length,
    approved_hosts: testData.hosts.filter(h => h.is_verified).length,
    total_customers: testData.customers.length
  };
  
  res.json({
    success: true,
    stats: stats,
    message: 'Dashboard stats loaded successfully'
  });
});

// Get all hosts
app.get('/admin/hosts', (req, res) => {
  console.log('👥 All hosts endpoint called');
  
  res.json({
    success: true,
    hosts: testData.hosts,
    message: 'All hosts loaded successfully'
  });
});

// Get host requests (pending)
app.get('/admin/host-requests', (req, res) => {
  console.log('📋 Host requests endpoint called');
  
  const pendingHosts = testData.hosts.filter(h => !h.is_verified);
  
  res.json({
    success: true,
    requests: pendingHosts,
    message: 'Host requests loaded successfully'
  });
});

// Approve host
app.post('/admin/approve-host/:hostId', (req, res) => {
  const { hostId } = req.params;
  console.log('✅ Approving host:', hostId);
  
  const hostIndex = testData.hosts.findIndex(h => h.id === hostId);
  if (hostIndex !== -1) {
    testData.hosts[hostIndex].is_verified = true;
    res.json({
      success: true,
      message: 'Host approved successfully'
    });
  } else {
    res.status(404).json({
      success: false,
      message: 'Host not found'
    });
  }
});

// Reject host
app.post('/admin/reject-host/:hostId', (req, res) => {
  const { hostId } = req.params;
  console.log('❌ Rejecting host:', hostId);
  
  const hostIndex = testData.hosts.findIndex(h => h.id === hostId);
  if (hostIndex !== -1) {
    testData.hosts.splice(hostIndex, 1);
    res.json({
      success: true,
      message: 'Host rejected successfully'
    });
  } else {
    res.status(404).json({
      success: false,
      message: 'Host not found'
    });
  }
});

// Create new host
app.post('/auth/host/register', (req, res) => {
  const { name, email, age, gender, city, bio } = req.body;
  console.log('👤 Creating new host:', name);
  
  const newHost = {
    id: String(testData.hosts.length + 1),
    name,
    email,
    age,
    gender,
    city,
    bio,
    is_verified: true, // Auto-approve admin-created hosts
    created_at: new Date().toISOString()
  };
  
  testData.hosts.push(newHost);
  
  res.json({
    success: true,
    host: newHost,
    message: 'Host created successfully'
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message
  });
});

// 404 handler
app.use((req, res) => {
  console.log('🔍 404 - Endpoint not found:', req.method, req.path);
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

app.listen(port, () => {
  console.log('🚀 Test Admin Server running on port', port);
  console.log('📊 Dashboard: http://localhost:3001/admin/dashboard');
  console.log('👥 Hosts: http://localhost:3001/admin/hosts');
  console.log('📋 Requests: http://localhost:3001/admin/host-requests');
  console.log('✅ Ready for admin panel testing!');
});
