import dotenv from 'dotenv';
dotenv.config();

function parseOrigins(input) {
  if (!input) return [];
  return input.split(',').map(s => s.trim()).filter(Boolean);
}

 const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  AGORA_APP_ID: process.env.AGORA_APP_ID || '',
  AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE || '',
  ALLOWED_ORIGINS: parseOrigins(process.env.ALLOWED_ORIGINS || ''),
  ENABLE_ADMIN: (process.env.ENABLE_ADMIN || 'true') === 'true',
  ENABLE_HOST: (process.env.ENABLE_HOST || 'true') === 'true',
  ENABLE_AGORA: (process.env.ENABLE_AGORA || 'true') === 'true',
};

export default config