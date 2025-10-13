# Friendy Backend API

This is the backend API server for the Friendy dating app that connects to your NeonDB PostgreSQL database.

## 🚀 Quick Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

The server will start on `http://localhost:3000` and automatically:
- Connect to your NeonDB database
- Create the required tables (users, user_preferences)
- Initialize the API endpoints

## 📡 API Endpoints

### Authentication
- `POST /auth/signup` - Create new user account
- `POST /auth/signin` - Sign in with email/password

### Users
- `GET /users/:userId` - Get user profile data
- `PUT /users/:userId` - Update user profile
- `GET /users` - Get all users (for testing)

### Health Check
- `GET /health` - Check if API is running

## 🗄️ Database Schema

The API automatically creates these tables in your NeonDB:

### users
- `id` (UUID, Primary Key)
- `email` (VARCHAR, Unique)
- `name` (VARCHAR)
- `password_hash` (VARCHAR)
- `age` (INTEGER)
- `bio` (TEXT)
- `location` (VARCHAR)
- `profile_images` (TEXT[])
- `interests` (TEXT[])
- `gender` (VARCHAR)
- `looking_for` (VARCHAR)
- `coins` (INTEGER, Default: 50)
- `is_premium` (BOOLEAN, Default: false)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### user_preferences
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key)
- `min_age` (INTEGER, Default: 18)
- `max_age` (INTEGER, Default: 99)
- `max_distance` (INTEGER, Default: 50)
- `show_me` (VARCHAR, Default: 'everyone')
- `notifications_enabled` (BOOLEAN, Default: true)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

## 🔧 Configuration

The database connection string is already configured for your NeonDB:
```
postgresql://neondb_owner:npg_DE1bzAelkv8F@ep-lively-violet-a87k9pc3-pooler.eastus2.azure.neon.tech/neondb?sslmode=require
```

## 🧪 Testing

Once the server is running, you can test it:

1. **Health Check:**
   ```bash
   curl http://localhost:3000/health
   ```

2. **Create a test user:**
   ```bash
   curl -X POST http://localhost:3000/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
   ```

3. **Sign in:**
   ```bash
   curl -X POST http://localhost:3000/auth/signin \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'
   ```

## 🔒 Security Features

- ✅ Password hashing with bcrypt
- ✅ SQL injection protection with parameterized queries
- ✅ CORS enabled for Flutter web app
- ✅ Input validation
- ✅ Error handling

## 📱 Flutter Integration

The Flutter app will automatically connect to this API when you:
1. Start this backend server (`npm start`)
2. Run your Flutter app (`flutter run -d chrome`)

The app will now save all user data to your real NeonDB database instead of browser localStorage!

## 🐛 Troubleshooting

### Server won't start
- Make sure Node.js is installed: `node --version`
- Install dependencies: `npm install`
- Check if port 3000 is available

### Database connection issues
- Verify your NeonDB connection string is correct
- Check if your NeonDB instance is running
- Ensure SSL is enabled (required for Neon)

### Flutter app can't connect
- Make sure backend server is running on `http://localhost:3000`
- Check browser console for CORS errors
- Verify the API health endpoint: `http://localhost:3000/health`

## 🎯 Next Steps

Once this is working, you can:
1. Add more API endpoints (matches, messages, etc.)
2. Implement real-time features with WebSockets
3. Add image upload functionality
4. Deploy to production (Vercel, Railway, etc.)
