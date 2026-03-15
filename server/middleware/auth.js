const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set');
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const authenticateAPIKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validKey = process.env.LOCATION_API_KEY;

  if (!validKey) throw new Error('LOCATION_API_KEY environment variable must be set');

  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({ message: 'Invalid API key' });
  }
  next();
};

const authenticateAPIKeyOrToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const apiKey = req.headers['x-api-key'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ message: 'Invalid or expired token' });
      }
      req.user = user;
      next();
    });
    return;
  }

  const validKey = process.env.LOCATION_API_KEY;
  if (validKey && apiKey === validKey) {
    req.user = null;
    next();
    return;
  }

  return res.status(401).json({ message: 'Authentication required' });
};

module.exports = { authenticateToken, authenticateAPIKey, authenticateAPIKeyOrToken };
