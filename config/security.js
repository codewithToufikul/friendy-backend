import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

function applySecurity(app) {
  app.use(helmet({
    contentSecurityPolicy: false,
  }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Mild default limiter for all routes
  const defaultLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(defaultLimiter);

  return { authLimiter };
}

export default applySecurity;
