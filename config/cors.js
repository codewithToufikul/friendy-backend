import config from './env.js';

function buildCorsOptions() {
  // In dev, allow all for faster iteration if no ALLOWED_ORIGINS set
  if (config.NODE_ENV !== 'production' && config.ALLOWED_ORIGINS.length === 0) {
    return { origin: true, credentials: true, methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept','Origin'] };
  }

  const allowList = new Set(config.ALLOWED_ORIGINS);
  return {
    origin: function (origin, callback) {
      // Allow non-browser tools (no origin) and whitelisted origins
      if (!origin || allowList.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept','Origin']
  };
}

export default buildCorsOptions;
