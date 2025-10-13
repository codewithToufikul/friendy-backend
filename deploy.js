#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Friendy Backend Deployment Script');
console.log('=====================================');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('⚠️  No .env file found. Creating from .env.example...');
  
  const envExamplePath = path.join(__dirname, '.env.example');
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ .env file created. Please update it with your configuration.');
    console.log('');
    console.log('🔧 Required configurations:');
    console.log('- DATABASE_URL: Your PostgreSQL connection string');
    console.log('- JWT_SECRET: A secure random string');
    console.log('- AGORA_APP_ID: Your Agora app ID');
    console.log('- FIREBASE_PROJECT_ID: Your Firebase project ID');
    console.log('');
    console.log('💡 For NeonDB (recommended):');
    console.log('DATABASE_URL=postgresql://username:password@ep-example.us-east-1.aws.neon.tech/friendy_db?sslmode=require');
    console.log('');
  } else {
    console.error('❌ .env.example file not found!');
    process.exit(1);
  }
}

// Load environment variables
require('dotenv').config();

// Deployment options
const deploymentType = process.argv[2] || 'local';

console.log(`📦 Deployment Type: ${deploymentType}`);
console.log('');

switch (deploymentType) {
  case 'local':
    deployLocal();
    break;
  case 'heroku':
    deployHeroku();
    break;
  case 'railway':
    deployRailway();
    break;
  case 'render':
    deployRender();
    break;
  case 'vercel':
    deployVercel();
    break;
  default:
    console.log('Usage: node deploy.js [local|heroku|railway|render|vercel]');
    process.exit(1);
}

function deployLocal() {
  console.log('🏠 Local Deployment');
  console.log('-------------------');
  
  try {
    // Install dependencies
    console.log('📦 Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
    
    // Setup database
    console.log('🗄️  Setting up database...');
    execSync('node setup-database.js', { stdio: 'inherit' });
    
    // Start server
    console.log('🚀 Starting production server...');
    console.log('');
    console.log('✅ Local deployment complete!');
    console.log('🌐 Server will start on: http://localhost:3000');
    console.log('📊 Health check: http://localhost:3000/health');
    console.log('');
    
    execSync('npm start', { stdio: 'inherit' });
    
  } catch (error) {
    console.error('❌ Local deployment failed:', error.message);
    process.exit(1);
  }
}

function deployHeroku() {
  console.log('🟣 Heroku Deployment');
  console.log('--------------------');
  
  try {
    // Check if Heroku CLI is installed
    execSync('heroku --version', { stdio: 'pipe' });
    
    console.log('📝 Creating Heroku app...');
    const appName = `friendy-backend-${Date.now()}`;
    execSync(`heroku create ${appName}`, { stdio: 'inherit' });
    
    console.log('🗄️  Adding PostgreSQL addon...');
    execSync(`heroku addons:create heroku-postgresql:mini -a ${appName}`, { stdio: 'inherit' });
    
    console.log('⚙️  Setting environment variables...');
    execSync(`heroku config:set NODE_ENV=production -a ${appName}`, { stdio: 'inherit' });
    execSync(`heroku config:set JWT_SECRET=${process.env.JWT_SECRET || 'your-jwt-secret'} -a ${appName}`, { stdio: 'inherit' });
    
    console.log('🚀 Deploying to Heroku...');
    execSync('git add .', { stdio: 'inherit' });
    execSync('git commit -m "Deploy to Heroku" || true', { stdio: 'inherit' });
    execSync(`git push heroku main`, { stdio: 'inherit' });
    
    console.log('🗄️  Running database setup...');
    execSync(`heroku run node setup-database.js -a ${appName}`, { stdio: 'inherit' });
    
    console.log('✅ Heroku deployment complete!');
    console.log(`🌐 Your app: https://${appName}.herokuapp.com`);
    
  } catch (error) {
    console.error('❌ Heroku deployment failed:', error.message);
    console.log('💡 Make sure Heroku CLI is installed: https://devcenter.heroku.com/articles/heroku-cli');
    process.exit(1);
  }
}

function deployRailway() {
  console.log('🚂 Railway Deployment');
  console.log('---------------------');
  
  try {
    // Check if Railway CLI is installed
    execSync('railway --version', { stdio: 'pipe' });
    
    console.log('📝 Initializing Railway project...');
    execSync('railway login', { stdio: 'inherit' });
    execSync('railway init', { stdio: 'inherit' });
    
    console.log('🗄️  Adding PostgreSQL service...');
    execSync('railway add postgresql', { stdio: 'inherit' });
    
    console.log('⚙️  Setting environment variables...');
    execSync(`railway variables set NODE_ENV=production`, { stdio: 'inherit' });
    execSync(`railway variables set JWT_SECRET="${process.env.JWT_SECRET || 'your-jwt-secret'}"`, { stdio: 'inherit' });
    
    console.log('🚀 Deploying to Railway...');
    execSync('railway up', { stdio: 'inherit' });
    
    console.log('✅ Railway deployment complete!');
    console.log('🌐 Check your Railway dashboard for the app URL');
    
  } catch (error) {
    console.error('❌ Railway deployment failed:', error.message);
    console.log('💡 Make sure Railway CLI is installed: https://docs.railway.app/develop/cli');
    process.exit(1);
  }
}

function deployRender() {
  console.log('🎨 Render Deployment');
  console.log('--------------------');
  
  console.log('📋 Manual steps for Render deployment:');
  console.log('');
  console.log('1. Go to https://render.com and create an account');
  console.log('2. Connect your GitHub repository');
  console.log('3. Create a new Web Service');
  console.log('4. Set the following:');
  console.log('   - Build Command: npm install');
  console.log('   - Start Command: npm start');
  console.log('   - Environment: Node');
  console.log('');
  console.log('5. Add environment variables:');
  console.log('   - NODE_ENV=production');
  console.log(`   - JWT_SECRET=${process.env.JWT_SECRET || 'your-jwt-secret'}`);
  console.log('   - DATABASE_URL=<your-postgresql-url>');
  console.log('');
  console.log('6. Create a PostgreSQL database service');
  console.log('7. Deploy the service');
  console.log('');
  console.log('💡 Render offers free PostgreSQL and web services for small projects');
}

function deployVercel() {
  console.log('▲ Vercel Deployment');
  console.log('-------------------');
  
  try {
    // Check if Vercel CLI is installed
    execSync('vercel --version', { stdio: 'pipe' });
    
    // Create vercel.json configuration
    const vercelConfig = {
      "version": 2,
      "builds": [
        {
          "src": "production-server.js",
          "use": "@vercel/node"
        }
      ],
      "routes": [
        {
          "src": "/(.*)",
          "dest": "/production-server.js"
        }
      ],
      "env": {
        "NODE_ENV": "production"
      }
    };
    
    fs.writeFileSync('vercel.json', JSON.stringify(vercelConfig, null, 2));
    console.log('📝 Created vercel.json configuration');
    
    console.log('🚀 Deploying to Vercel...');
    execSync('vercel --prod', { stdio: 'inherit' });
    
    console.log('✅ Vercel deployment complete!');
    console.log('⚠️  Note: You need to set up a separate PostgreSQL database');
    console.log('💡 Recommended: Use NeonDB or PlanetScale for the database');
    
  } catch (error) {
    console.error('❌ Vercel deployment failed:', error.message);
    console.log('💡 Make sure Vercel CLI is installed: npm i -g vercel');
    process.exit(1);
  }
}

// Create Procfile for Heroku
if (!fs.existsSync('Procfile')) {
  fs.writeFileSync('Procfile', 'web: node production-server.js\n');
  console.log('📝 Created Procfile for Heroku');
}

console.log('');
console.log('🎉 Deployment script completed!');
console.log('');
console.log('📚 Next steps:');
console.log('1. Update your Flutter app to use the production API URL');
console.log('2. Test all endpoints with the new backend');
console.log('3. Set up monitoring and logging');
console.log('4. Configure SSL certificates');
console.log('5. Set up automated backups');
console.log('');
