const { Router } = require('express');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { containerClient, generateSasUrl } = require('../azure');
const { authenticateToken, authenticateAPIKeyOrToken } = require('../middleware/auth');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const trips = db.collection('trips');

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ datasets: [] });
    }

    let decoded;
    try {
      const token = authHeader.split(' ')[1];
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (e) {
      return res.json({ datasets: [] });
    }

    const friendDocs = await db.collection('friend_requests').find({
      $or: [
        { senderId: decoded.userId, status: 'accepted' },
        { receiverId: decoded.userId, status: 'accepted' }
      ]
    }).toArray();

    const friendIds = friendDocs.map(f =>
      f.senderId === decoded.userId ? f.receiverId : f.senderId
    );

    const { visibility, before } = req.query;
    let filter;

    if (visibility === 'friends') {
      filter = { userId: { $in: [...friendIds, decoded.userId] } };
    } else {
      filter = { userId: { $in: [...friendIds, decoded.userId, 'anonymous'] } };
    }

    if (before) {
      filter.createdAt = { $lt: new Date(before) };
    }

    const PAGE_SIZE = 10;
    const allTrips = await trips
      .find(filter, { projection: { gpsPoints: 0 } })
      .sort({ createdAt: -1 })
      .limit(PAGE_SIZE + 1)
      .toArray();

    const hasMore = allTrips.length > PAGE_SIZE;
    if (hasMore) allTrips.pop();

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

    res.json({ datasets: tripsWithPics, hasMore });
  } catch (error) {
    console.error('Fetch trips error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', authenticateAPIKeyOrToken, async (req, res) => {
  try {
    const db = getDb();
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

    let userId = 'anonymous';
    let userName = null;
    let userEmail = null;
    if (req.user) {
      const user = await db.collection('user_credentals').findOne({ _id: new ObjectId(req.user.userId) });
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

router.get('/:id/points', async (req, res) => {
  try {
    const trip = await getDb().collection('trips').findOne(
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

router.get('/:id/photos', async (req, res) => {
  try {
    const db = getDb();
    const trip = await db.collection('trips').findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { photoKeys: 1 } }
    );

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    if (!trip.photoKeys || trip.photoKeys.length === 0) {
      return res.json({ photos: [] });
    }

    const photos = await db.collection('photos')
      .find({ photoKey: { $in: trip.photoKeys } })
      .toArray();

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

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const trips = db.collection('trips');
    const photosCollection = db.collection('photos');

    const trip = await trips.findOne({ _id: new ObjectId(req.params.id) });
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    if (trip.userId !== req.user.userId) {
      return res.status(403).json({ message: 'You can only delete your own trips' });
    }

    if (trip.photoKeys && trip.photoKeys.length > 0) {
      for (const key of trip.photoKeys) {
        try {
          const blobClient = containerClient.getBlobClient(key);
          await blobClient.deleteIfExists();
        } catch (err) {
          console.error(`Failed to delete blob ${key}:`, err);
        }
      }
      await photosCollection.deleteMany({ photoKey: { $in: trip.photoKeys } });
    }

    await trips.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('Delete trip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const trips = getDb().collection('trips');

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

module.exports = router;
