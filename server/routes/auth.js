const { Router } = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { generateSasUrl } = require('../azure');

const router = Router();

router.post('/login', async (req, res) => {
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

module.exports = router;
