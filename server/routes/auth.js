const { Router } = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const appleSignin = require('apple-signin-auth');
const { getDb } = require('../db');
const { generateSasUrl } = require('../azure');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                   // 30 attempts per window
  message: { message: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const users = getDb().collection('user_credentals');
    const { email, password } = req.body;

    const user = await users.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    let profilePictureUrl = null;
    if (user.profilePictureKey) {
      profilePictureUrl = generateSasUrl(user.profilePictureKey);
    }

    res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        profilePictureUrl,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const users = getDb().collection('user_credentals');
    const { email, password, name } = req.body;

    const existingEmail = await users.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    if (name && name.trim()) {
      const existingName = await users.findOne({ name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
      if (existingName) {
        return res.status(400).json({ message: 'Username already taken' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await users.insertOne({
      email,
      password: hashedPassword,
      name: name ? name.trim() : null,
      createdAt: new Date(),
    });

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/refresh', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const newToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    res.json({ token: newToken });
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired token' });
  }
});

// Shared — find existing user from OAuth login, or prompt for username if new
async function oauthLogin(res, { oauthProvider, oauthId, email, name }) {
  const users = getDb().collection('user_credentals');

  let user = await users.findOne({ oauthProvider, oauthId });

  if (!user && email) {
    user = await users.findOne({ email });
  }

  if (user) {
    // Link oauth to existing email/password account if not already linked
    if (!user.oauthId) {
      await users.updateOne(
        { _id: user._id },
        { $set: { oauthProvider, oauthId } }
      );
    }

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    let profilePictureUrl = null;
    if (user.profilePictureKey) {
      profilePictureUrl = generateSasUrl(user.profilePictureKey);
    }

    return res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        profilePictureUrl,
      }
    });
  }

  // New user — issue a short-lived setup token, frontend must collect a username
  const setupToken = jwt.sign(
    { oauthProvider, oauthId, email: email || null, name: name || null, isOAuthPending: true },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );

  res.status(202).json({ needsUsername: true, setupToken });
}

// POST /api/auth/complete — finish OAuth signup with a chosen username
router.post('/auth/complete', async (req, res) => {
  try {
    const { setupToken, username } = req.body;

    if (!setupToken || !username || !username.trim()) {
      return res.status(400).json({ message: 'setupToken and username are required' });
    }

    let pending;
    try {
      pending = jwt.verify(setupToken, process.env.JWT_SECRET);
    } catch {
      return res.status(403).json({ message: 'Setup token expired or invalid — please sign in again' });
    }

    if (!pending.isOAuthPending) {
      return res.status(400).json({ message: 'Invalid setup token' });
    }

    const users = getDb().collection('user_credentals');

    const existingName = await users.findOne({
      name: { $regex: new RegExp(`^${username.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (existingName) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    const result = await users.insertOne({
      email: pending.email || null,
      name: username.trim(),
      oauthProvider: pending.oauthProvider,
      oauthId: pending.oauthId,
      createdAt: new Date(),
    });

    const token = jwt.sign(
      { userId: result.insertedId.toString(), email: pending.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: {
        id: result.insertedId.toString(),
        email: pending.email,
        name: username.trim(),
        profilePictureUrl: null,
      }
    });
  } catch (error) {
    console.error('Complete OAuth signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/auth/google', loginLimiter, async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ message: 'Google Sign In is not configured' });
  }

  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: 'idToken is required' });

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    await oauthLogin(res, {
      oauthProvider: 'google',
      oauthId: payload.sub,
      email: payload.email,
      name: payload.name,
    });
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(401).json({ message: 'Invalid Google token' });
  }
});

router.post('/auth/apple', loginLimiter, async (req, res) => {
  if (!process.env.APPLE_BUNDLE_ID) {
    return res.status(503).json({ message: 'Apple Sign In is not configured' });
  }

  try {
    const { idToken, name } = req.body;
    if (!idToken) return res.status(400).json({ message: 'idToken is required' });

    const payload = await appleSignin.verifyIdToken(idToken, {
      audience: process.env.APPLE_BUNDLE_ID,
      ignoreExpiration: false,
    });

    await oauthLogin(res, {
      oauthProvider: 'apple',
      oauthId: payload.sub,
      email: payload.email || null,
      name: name || null, // Apple only sends name on very first login
    });
  } catch (error) {
    console.error('Apple OAuth error:', error);
    res.status(401).json({ message: 'Invalid Apple token' });
  }
});

module.exports = router;
