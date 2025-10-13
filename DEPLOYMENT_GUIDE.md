# 🚀 Friendy Backend Deployment Guide

## 📋 Overview

This guide will help you deploy the Friendy backend from test server to full production with PostgreSQL database.

## 🎯 What We've Built

### ✅ **Production Server Features**
- **Full PostgreSQL Integration** with proper schema
- **JWT Authentication** with secure token management
- **File Upload Support** for profile photos
- **RESTful API Endpoints** for all host operations
- **Database Migrations** and seeding
- **Environment Configuration** for different deployments
- **Security Features** (CORS, rate limiting, input validation)

### ✅ **Database Schema**
- `hosts` - Host profiles and authentication
- `host_pricing` - Individual host pricing rates
- `call_sessions` - Call history and management
- `streaming_sessions` - Live streaming data
- `messages` - Chat and messaging system
- `transactions` - Earnings and payment tracking
- `withdrawals` - Payout management

### ✅ **API Endpoints**
```
Authentication:
POST /auth/host/register - Register new host
POST /auth/host - Host login with JWT

Profile Management:
GET /api/hosts/:hostId/profile - Get host profile
PUT /api/hosts/:hostId/profile - Update host profile
POST /api/hosts/:hostId/photo - Upload profile photo

Pricing:
GET /host/pricing/:hostId - Get host pricing
POST /host/pricing/:hostId - Update host pricing

Earnings & Transactions:
GET /earnings-summary/:hostId - Get earnings summary
GET /transactions/:hostId - Get transaction history
GET /call-requests/:hostId/pending - Get pending calls

Health Check:
GET /health - Server health status
```

## 🗄️ Database Setup Options

### Option 1: NeonDB (Recommended for Production)
```bash
# 1. Create account at https://neon.tech
# 2. Create new project "friendy-production"
# 3. Copy connection string
# 4. Update .env file:
DATABASE_URL=postgresql://username:password@ep-example.us-east-1.aws.neon.tech/friendy_db?sslmode=require
```

### Option 2: Local PostgreSQL (Development)
```bash
# Install PostgreSQL
# Windows: Download from https://www.postgresql.org/download/windows/
# Mac: brew install postgresql
# Ubuntu: sudo apt-get install postgresql

# Start PostgreSQL service
# Windows: Start PostgreSQL service from Services
# Mac/Linux: sudo service postgresql start

# Create database
psql -U postgres
CREATE DATABASE friendy_db;
\q
```

### Option 3: Railway (Free Tier)
```bash
# 1. Install Railway CLI: npm install -g @railway/cli
# 2. Login: railway login
# 3. Create project: railway init
# 4. Add PostgreSQL: railway add postgresql
# 5. Get connection string: railway variables
```

## 🚀 Deployment Options

### 1. Local Development
```bash
# Setup environment
cp .env.example .env
# Edit .env with your database URL

# Install dependencies
npm install

# Setup database (if PostgreSQL is running)
node setup-database.js

# Start production server
npm start
```

### 2. Railway Deployment (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway add postgresql
railway up

# Set environment variables
railway variables set NODE_ENV=production
railway variables set JWT_SECRET=your-secure-jwt-secret
```

### 3. Heroku Deployment
```bash
# Install Heroku CLI
# Create app
heroku create friendy-backend-production

# Add PostgreSQL
heroku addons:create heroku-postgresql:mini

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secure-jwt-secret

# Deploy
git push heroku main

# Setup database
heroku run node setup-database.js
```

### 4. Render Deployment
```bash
# 1. Connect GitHub repo to Render
# 2. Create Web Service
# 3. Set build command: npm install
# 4. Set start command: npm start
# 5. Add PostgreSQL service
# 6. Set environment variables in dashboard
```

## 🔧 Environment Variables

Create `.env` file with these variables:

```env
# Server
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=your_postgresql_connection_string

# Security
JWT_SECRET=your-super-secure-jwt-secret-key

# File Upload
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads

# CORS
ALLOWED_ORIGINS=https://your-frontend-domain.com

# Optional: Email, Redis, etc.
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## 📱 Flutter App Configuration

Update your Flutter app to use the production API:

```dart
// In host_app/lib/services/host_api_service.dart
static const String baseUrl = kDebugMode
    ? 'http://localhost:3000'
    : 'https://your-production-api-url.com'; // Update this!
```

## 🧪 Testing the Production API

### 1. Health Check
```bash
curl https://your-api-url.com/health
```

### 2. Test Registration
```bash
curl -X POST https://your-api-url.com/auth/host/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Host",
    "email": "test@example.com",
    "password": "password123",
    "phone": "+91 98765 43210",
    "age": 25,
    "gender": "Female",
    "city": "Mumbai"
  }'
```

### 3. Test Login
```bash
curl -X POST https://your-api-url.com/auth/host/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

## 📊 Sample Data

The setup script creates a sample host account:
- **Email**: priya@friendy.com
- **Password**: password123

Use this for testing the production API.

## 🔒 Security Checklist

- ✅ JWT tokens with secure secrets
- ✅ Password hashing with bcrypt
- ✅ CORS configuration
- ✅ Input validation
- ✅ SQL injection prevention
- ✅ File upload restrictions
- ✅ Rate limiting (ready to implement)
- ✅ HTTPS enforcement (configure on deployment platform)

## 📈 Monitoring & Maintenance

### Logs
```bash
# Railway
railway logs

# Heroku
heroku logs --tail

# Local
tail -f logs/app.log
```

### Database Backup
```bash
# Manual backup
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```

## 🎉 Next Steps

1. **Deploy Backend**: Choose a deployment option above
2. **Update Flutter App**: Change API URL to production
3. **Test All Features**: Registration, login, profile, earnings
4. **Set up Monitoring**: Add logging and error tracking
5. **Configure SSL**: Ensure HTTPS is enabled
6. **Set up Backups**: Regular database backups
7. **Performance Optimization**: Add caching, CDN for uploads

## 🆘 Troubleshooting

### Common Issues

**Database Connection Error**
```
Error: connect ECONNREFUSED
```
- Check DATABASE_URL is correct
- Ensure database server is running
- Verify network connectivity

**JWT Token Error**
```
Error: Invalid or expired token
```
- Check JWT_SECRET is set
- Verify token is being sent in Authorization header
- Check token expiration time

**File Upload Error**
```
Error: No photo file uploaded
```
- Check file size limits
- Verify file type restrictions
- Ensure uploads directory exists

## 📞 Support

For deployment issues:
1. Check the logs first
2. Verify environment variables
3. Test database connectivity
4. Check API endpoints with curl

**Your Friendy backend is now production-ready! 🚀**
