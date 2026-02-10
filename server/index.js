const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = express();
app.use(express.json({ limit: '10mb' })); // Increase limit for base64 images
app.use(express.static(path.join(__dirname, '../public'))); // Serve static files from public folder
app.use(cors());

// MongoDB connection
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Error: Could not load MONGODB_URI. Ensure .env exists in project root and is UTF-8 encoded.');
  throw new Error('MONGODB_URI environment variable is not defined');
}

const client = new MongoClient(uri, {
  family: 4, // Force IPv4 to avoid some DNS resolution issues
});

// Connect to MongoDB once at startup
async function startServer() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    app.listen(5000, () => console.log('Server running on port 5000'));
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
  }
}
startServer();

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const users = db.collection('user_credentals');

    const { email, password } = req.body;

    // Find user by email
    const user = await users.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Compare passwords
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Return user data (without password)
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        // Add other user fields
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Signup endpoint
app.post('/api/signup', async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const users = db.collection('user_credentals');

    const { email, password } = req.body;

    // Check if user exists
    const existingUser = await users.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = {
      email,
      password: hashedPassword,
      createdAt: new Date(),
    };

    await users.insertOne(newUser);

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Create post endpoint
app.post('/api/posts', authenticateToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const posts = db.collection('posts');
    const users = db.collection('user_credentals');

    const { description, image } = req.body;

    // Validate input
    if (!description || !image) {
      return res.status(400).json({ message: 'Description and image are required' });
    }

    // Get user info from database
    const user = await users.findOne({ _id: new ObjectId(req.user.userId) });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create post object following the schema
    const newPost = {
      userId: req.user.userId,
      userEmail: user.email,
      userName: user.name || null,
      description,
      imageUrl: image,
      createdAt: new Date(),
      updatedAt: new Date(),
      likes: [],
      likesCount: 0,
      comments: [],
      commentsCount: 0
    };

    const result = await posts.insertOne(newPost);

    res.status(201).json({
      message: 'Post created successfully',
      post: { ...newPost, _id: result.insertedId }
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all posts endpoint
app.get('/api/posts', async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const posts = db.collection('posts');

    // Fetch all posts, sorted by newest first
    const allPosts = await posts
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ posts: allPosts });
  } catch (error) {
    console.error('Fetch posts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get posts by user endpoint
app.get('/api/posts/user/:userId', async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const posts = db.collection('posts');

    const userPosts = await posts
      .find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ posts: userPosts });
  } catch (error) {
    console.error('Fetch user posts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Location tracking endpoints
// Middleware to verify API key for location tracking
const authenticateAPIKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validKey = process.env.LOCATION_API_KEY || 'your-location-key';

  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({ message: 'Invalid API key' });
  }
  next();
};

// Single location update
app.post('/api/location', authenticateAPIKey, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const locations = db.collection('locations');

    const { latitude, longitude, altitude, speed, accuracy, timestamp, userId } = req.body;

    // Validate required fields
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    // Create location document
    const locationData = {
      userId: userId || 'anonymous', // Optional user association
      latitude,
      longitude,
      altitude: altitude || 0,
      speed: speed || 0,
      accuracy: accuracy || 0,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      createdAt: new Date()
    };

    await locations.insertOne(locationData);

    res.status(201).json({
      message: 'Location saved successfully',
      location: locationData
    });
  } catch (error) {
    console.error('Save location error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Batch location update (for offline buffer)
app.post('/api/locations/batch', authenticateAPIKey, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const locations = db.collection('locations');

    const { locations: locationArray, userId } = req.body;

    if (!Array.isArray(locationArray) || locationArray.length === 0) {
      return res.status(400).json({ message: 'Locations array is required' });
    }

    // Prepare batch insert
    const locationDocs = locationArray.map(loc => ({
      userId: userId || 'anonymous',
      latitude: loc.latitude,
      longitude: loc.longitude,
      altitude: loc.altitude || 0,
      speed: loc.speed || 0,
      accuracy: loc.accuracy || 0,
      timestamp: loc.timestamp ? new Date(loc.timestamp) : new Date(),
      createdAt: new Date()
    }));

    const result = await locations.insertMany(locationDocs);

    res.status(201).json({
      message: 'Locations saved successfully',
      count: result.insertedCount
    });
  } catch (error) {
    console.error('Save batch locations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get locations for a user
app.get('/api/locations/:userId', authenticateToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const locations = db.collection('locations');

    // Optional query params for filtering
    const { startDate, endDate, limit = 100 } = req.query;

    const query = { userId: req.params.userId };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const userLocations = await locations
      .find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .toArray();

    res.json({
      locations: userLocations,
      count: userLocations.length
    });
  } catch (error) {
    console.error('Fetch locations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});