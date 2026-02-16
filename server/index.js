const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../build')));

// MongoDB connection
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Error: Could not load MONGODB_URI. Ensure .env exists in project root and is UTF-8 encoded.');
  throw new Error('MONGODB_URI environment variable is not defined');
}

const client = new MongoClient(uri, {
  family: 4,
  maxPoolSize: 5,
  minPoolSize: 1,
  maxIdleTimeMS: 30000,
});

// Azure Blob Storage setup
const azureConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
if (!azureConnectionString) {
  console.error('Error: AZURE_STORAGE_CONNECTION_STRING not set');
  throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable is not defined');
}
const blobServiceClient = BlobServiceClient.fromConnectionString(azureConnectionString);
const containerName = 'trip-photos';
const containerClient = blobServiceClient.getContainerClient(containerName);

// Parse account name and key from connection string for SAS generation
const accountName = azureConnectionString.match(/AccountName=([^;]+)/)?.[1];
const accountKey = azureConnectionString.match(/AccountKey=([^;]+)/)?.[1];
const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

// Generate a temporary SAS URL for a blob (valid for 1 hour)
function generateSasUrl(photoKey) {
  const sasToken = generateBlobSASQueryParameters({
    containerName,
    blobName: photoKey,
    permissions: BlobSASPermissions.parse('r'),
    startsOn: new Date(),
    expiresOn: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  }, sharedKeyCredential).toString();

  return `https://${accountName}.blob.core.windows.net/${containerName}/${photoKey}?${sasToken}`;
}

async function ensureContainer() {
  try {
    await containerClient.createIfNotExists();
    console.log(`Azure container "${containerName}" ready`);
  } catch (error) {
    console.error('Failed to create Azure container:', error);
  }
}

// Connect to MongoDB and Azure at startup
async function startServer() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    await ensureContainer();
    app.listen(5000, () => console.log('Server running on port 5000'));
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}
startServer();

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const users = db.collection('user_credentals');

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

    // Generate profile picture URL if user has one
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

// Signup endpoint
app.post('/api/signup', async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const users = db.collection('user_credentals');

    const { email, password, name } = req.body;

    const existingUser = await users.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      email,
      password: hashedPassword,
      name: name || null,
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
  const token = authHeader && authHeader.split(' ')[1];

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

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    const locationData = {
      userId: userId || 'anonymous',
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

// Update user profile
app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const users = db.collection('user_credentals');

    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    await users.updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $set: { name: name.trim() } }
    );

    res.json({ message: 'Profile updated successfully', name: name.trim() });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Middleware: accept either API key or JWT token
const authenticateAPIKeyOrToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const apiKey = req.headers['x-api-key'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
      if (err) {
        return res.status(403).json({ message: 'Invalid or expired token' });
      }
      req.user = user;
      next();
    });
    return;
  }

  const validKey = process.env.LOCATION_API_KEY || 'your-location-key';
  if (apiKey && apiKey === validKey) {
    req.user = null;
    next();
    return;
  }

  return res.status(401).json({ message: 'Authentication required' });
};

// Upload a photo to Azure Blob Storage
app.post('/api/photos/upload', authenticateAPIKeyOrToken, async (req, res) => {
  try {
    const { base64, size, timestamp, location } = req.body;

    if (!base64) {
      return res.status(400).json({ message: 'base64 image data is required' });
    }

    // Generate a unique blob name
    const photoKey = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`;

    // Strip the data:image/...;base64, prefix if present
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload to Azure Blob Storage
    const blockBlobClient = containerClient.getBlockBlobClient(photoKey);
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: 'image/jpeg' },
    });

    const photoUrl = blockBlobClient.url;

    // Save photo metadata to MongoDB
    const db = client.db('Car_Database');
    const photos = db.collection('photos');

    const photoDoc = {
      photoKey,
      url: photoUrl,
      filename: photoKey,
      size: size || buffer.length,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      location: location || null,
      createdAt: new Date(),
    };

    const result = await photos.insertOne(photoDoc);

    res.status(201).json({
      photoKey,
      photoId: result.insertedId,
      url: photoUrl,
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({ message: 'Failed to upload photo' });
  }
});

// Save a trip (GPS data + photo keys)
app.post('/api/trips', authenticateAPIKeyOrToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const trips = db.collection('trips');

    const { gpsPoints, photoKeys, totalPhotoSize, timestamp, totalPoints, photoCount, title, description } = req.body;

    if (!gpsPoints || !Array.isArray(gpsPoints) || gpsPoints.length === 0) {
      return res.status(400).json({ message: 'GPS points array is required' });
    }

    if (!photoKeys || !Array.isArray(photoKeys) || photoKeys.length === 0) {
      return res.status(400).json({ message: 'Photo keys array is required' });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Description is required' });
    }

    // Look up user info if authenticated with JWT
    let userId = 'anonymous';
    let userName = null;
    let userEmail = null;
    if (req.user) {
      const users = db.collection('user_credentals');
      const user = await users.findOne({ _id: new ObjectId(req.user.userId) });
      if (user) {
        userId = req.user.userId;
        userName = user.name || null;
        userEmail = user.email;
      }
    }

    const trip = {
      gpsPoints,
      photoKeys,
      totalPhotoSize: totalPhotoSize || 0,
      photoCount: photoCount || photoKeys.length,
      totalPoints: totalPoints || gpsPoints.length,
      timestamp: new Date(timestamp || new Date()),
      createdAt: new Date(),
      userId,
      userName,
      userEmail,
      title: title.trim(),
      description: description.trim()
    };

    const result = await trips.insertOne(trip);

    // Also save individual points to locations collection
    const locationDocs = gpsPoints.map(point => ({
      userId,
      latitude: point.latitude,
      longitude: point.longitude,
      altitude: point.altitude || 0,
      speed: point.speed || 0,
      accuracy: point.accuracy || 0,
      timestamp: new Date(point.timestamp),
      createdAt: new Date(),
      tripId: result.insertedId
    }));

    if (locationDocs.length > 0) {
      await db.collection('locations').insertMany(locationDocs);
    }

    res.status(201).json({
      message: 'Trip saved successfully',
      tripId: result.insertedId,
      pointsSaved: gpsPoints.length,
      photoCount: photoKeys.length,
    });
  } catch (error) {
    console.error('Save trip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all trips - only show own + friends' posts (guests see nothing)
app.get('/api/trips', async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const trips = db.collection('trips');

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Not authenticated - no posts visible
      return res.json({ datasets: [] });
    }

    let decoded;
    try {
      const token = authHeader.split(' ')[1];
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (e) {
      return res.json({ datasets: [] });
    }

    // Get friend list
    const friendDocs = await db.collection('friend_requests').find({
      $or: [
        { senderId: decoded.userId, status: 'accepted' },
        { receiverId: decoded.userId, status: 'accepted' }
      ]
    }).toArray();

    const friendIds = friendDocs.map(f =>
      f.senderId === decoded.userId ? f.receiverId : f.senderId
    );

    // Build filter based on visibility toggle
    const { visibility } = req.query;
    let filter;

    if (visibility === 'friends') {
      // Friends-only: show only friends' posts + own (no anonymous)
      filter = { userId: { $in: [...friendIds, decoded.userId] } };
    } else {
      // Public: show own + friends' + anonymous posts
      filter = { userId: { $in: [...friendIds, decoded.userId, 'anonymous'] } };
    }

    const allTrips = await trips
      .find(filter, { projection: { gpsPoints: 0 } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    // Look up profile pictures for trip authors
    const authorIds = [...new Set(allTrips.map(t => t.userId).filter(id => id !== 'anonymous'))];
    const users = await db.collection('user_credentals').find(
      { _id: { $in: authorIds.map(id => new ObjectId(id)) } },
      { projection: { profilePictureKey: 1 } }
    ).toArray();

    const profilePicMap = {};
    users.forEach(u => {
      if (u.profilePictureKey) {
        profilePicMap[u._id.toString()] = generateSasUrl(u.profilePictureKey);
      }
    });

    const tripsWithPics = allTrips.map(t => ({
      ...t,
      userProfilePictureUrl: profilePicMap[t.userId] || null,
    }));

    res.json({ datasets: tripsWithPics });
  } catch (error) {
    console.error('Fetch trips error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a trip's GPS points
app.get('/api/trips/:id/points', async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const trips = db.collection('trips');

    const trip = await trips.findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { gpsPoints: 1 } }
    );

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    res.json({ gpsPoints: trip.gpsPoints });
  } catch (error) {
    console.error('Fetch trip points error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a trip's photos (metadata + Azure URLs from photos collection)
app.get('/api/trips/:id/photos', async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const trips = db.collection('trips');
    const photosCollection = db.collection('photos');

    const trip = await trips.findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { photoKeys: 1 } }
    );

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Look up photo metadata from the photos collection by photoKey
    const photos = await photosCollection
      .find({ photoKey: { $in: trip.photoKeys } })
      .toArray();

    // Generate temporary SAS URLs for each photo
    const photosWithSas = photos.map(photo => ({
      ...photo,
      url: generateSasUrl(photo.photoKey),
    }));

    res.json({ photos: photosWithSas });
  } catch (error) {
    console.error('Fetch trip photos error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a trip (owner only)
app.delete('/api/trips/:id', authenticateToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const trips = db.collection('trips');
    const photosCollection = db.collection('photos');

    const trip = await trips.findOne({ _id: new ObjectId(req.params.id) });
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    if (trip.userId !== req.user.userId) {
      return res.status(403).json({ message: 'You can only delete your own trips' });
    }

    // Delete photos from Azure Blob Storage
    if (trip.photoKeys && trip.photoKeys.length > 0) {
      for (const key of trip.photoKeys) {
        try {
          const blobClient = containerClient.getBlobClient(key);
          await blobClient.deleteIfExists();
        } catch (err) {
          console.error(`Failed to delete blob ${key}:`, err);
        }
      }
      // Delete photo metadata from photos collection
      await photosCollection.deleteMany({ photoKey: { $in: trip.photoKeys } });
    }

    // Delete the trip document
    await trips.deleteOne({ _id: new ObjectId(req.params.id) });

    res.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('Delete trip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a trip (owner only) - title and description
app.put('/api/trips/:id', authenticateToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const trips = db.collection('trips');

    const trip = await trips.findOne({ _id: new ObjectId(req.params.id) });
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    if (trip.userId !== req.user.userId) {
      return res.status(403).json({ message: 'You can only edit your own trips' });
    }

    const { title, description } = req.body;
    const update = {};
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;

    await trips.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: update }
    );

    res.json({ message: 'Trip updated successfully' });
  } catch (error) {
    console.error('Update trip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload profile picture
app.post('/api/profile/picture', authenticateToken, async (req, res) => {
  try {
    const { base64 } = req.body;
    if (!base64) {
      return res.status(400).json({ message: 'base64 image data is required' });
    }

    const photoKey = `profile-pictures/${req.user.userId}.jpg`;
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const blockBlobClient = containerClient.getBlockBlobClient(photoKey);
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: 'image/jpeg' },
    });

    // Update user record
    const db = client.db('Car_Database');
    await db.collection('user_credentals').updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $set: { profilePictureKey: photoKey } }
    );

    const profilePictureUrl = generateSasUrl(photoKey);
    res.json({ message: 'Profile picture updated', profilePictureUrl });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({ message: 'Failed to upload profile picture' });
  }
});

// ===== FRIENDS SYSTEM =====

// Search users by name or email
app.get('/api/users/search', authenticateToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const users = db.collection('user_credentals');
    const friendRequests = db.collection('friend_requests');
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ users: [] });
    }

    const regex = new RegExp(q.trim(), 'i');
    const results = await users
      .find(
        {
          _id: { $ne: new ObjectId(req.user.userId) },
          $or: [{ name: regex }, { email: regex }]
        },
        { projection: { password: 0 } }
      )
      .limit(20)
      .toArray();

    // Look up existing friend requests between current user and results
    const userIds = results.map(u => u._id.toString());
    const existingRequests = await friendRequests.find({
      $or: [
        { senderId: req.user.userId, receiverId: { $in: userIds } },
        { receiverId: req.user.userId, senderId: { $in: userIds } }
      ],
      status: { $in: ['pending', 'accepted'] }
    }).toArray();

    const enriched = results.map(u => {
      const uid = u._id.toString();
      const existing = existingRequests.find(r =>
        (r.senderId === req.user.userId && r.receiverId === uid) ||
        (r.receiverId === req.user.userId && r.senderId === uid)
      );
      let friendStatus = null;
      if (existing) {
        if (existing.status === 'accepted') friendStatus = 'accepted';
        else if (existing.senderId === req.user.userId) friendStatus = 'pending_sent';
        else friendStatus = 'pending_received';
      }
      return { _id: uid, name: u.name, email: u.email, friendStatus };
    });

    res.json({ users: enriched });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send a friend request
app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const users = db.collection('user_credentals');
    const friendRequests = db.collection('friend_requests');
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ message: 'receiverId is required' });
    }

    if (receiverId === req.user.userId) {
      return res.status(400).json({ message: 'Cannot send friend request to yourself' });
    }

    // Check receiver exists
    const receiver = await users.findOne({ _id: new ObjectId(receiverId) });
    if (!receiver) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check for existing request
    const existing = await friendRequests.findOne({
      $or: [
        { senderId: req.user.userId, receiverId, status: { $in: ['pending', 'accepted'] } },
        { senderId: receiverId, receiverId: req.user.userId, status: { $in: ['pending', 'accepted'] } }
      ]
    });
    if (existing) {
      return res.status(400).json({ message: 'Friend request already exists' });
    }

    // Look up sender info
    const sender = await users.findOne({ _id: new ObjectId(req.user.userId) });

    const request = {
      senderId: req.user.userId,
      senderName: sender?.name || null,
      senderEmail: sender?.email || req.user.email,
      receiverId,
      receiverName: receiver.name || null,
      receiverEmail: receiver.email,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await friendRequests.insertOne(request);
    res.status(201).json({ message: 'Friend request sent' });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get incoming pending friend requests
app.get('/api/friends/requests', authenticateToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const friendRequests = db.collection('friend_requests');

    const requests = await friendRequests
      .find({ receiverId: req.user.userId, status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ requests });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Accept a friend request
app.put('/api/friends/request/:id/accept', authenticateToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const friendRequests = db.collection('friend_requests');

    const request = await friendRequests.findOne({ _id: new ObjectId(req.params.id) });
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }
    if (request.receiverId !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already handled' });
    }

    await friendRequests.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: 'accepted', updatedAt: new Date() } }
    );

    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reject a friend request
app.put('/api/friends/request/:id/reject', authenticateToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const friendRequests = db.collection('friend_requests');

    const request = await friendRequests.findOne({ _id: new ObjectId(req.params.id) });
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }
    if (request.receiverId !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already handled' });
    }

    await friendRequests.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: 'rejected', updatedAt: new Date() } }
    );

    res.json({ message: 'Friend request rejected' });
  } catch (error) {
    console.error('Reject friend request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get friends list
app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const friendRequests = db.collection('friend_requests');

    const friendDocs = await friendRequests.find({
      $or: [
        { senderId: req.user.userId, status: 'accepted' },
        { receiverId: req.user.userId, status: 'accepted' }
      ]
    }).toArray();

    const friends = friendDocs.map(doc => {
      if (doc.senderId === req.user.userId) {
        return { id: doc.receiverId, name: doc.receiverName, email: doc.receiverEmail };
      }
      return { id: doc.senderId, name: doc.senderName, email: doc.senderEmail };
    });

    res.json({ friends });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove a friend
app.delete('/api/friends/:friendId', authenticateToken, async (req, res) => {
  try {
    const db = client.db('Car_Database');
    const friendRequests = db.collection('friend_requests');
    const { friendId } = req.params;

    const result = await friendRequests.deleteOne({
      $or: [
        { senderId: req.user.userId, receiverId: friendId, status: 'accepted' },
        { senderId: friendId, receiverId: req.user.userId, status: 'accepted' }
      ]
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Friendship not found' });
    }

    res.json({ message: 'Friend removed' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Catch-all: serve React app for any non-API, non-static routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});
