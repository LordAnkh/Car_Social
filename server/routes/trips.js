const { Router } = require('express');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { containerClient, generateSasUrl } = require('../azure');
const { authenticateToken, authenticateAPIKeyOrToken } = require('../middleware/auth');

const router = Router();

// Normalizes old single-owner trips to the new multi-participant shape.
// Old trips stay untouched in the DB — this only affects API responses.
function normalizeTrip(trip) {
  if (trip.ownerId) {
    // New format — add userId/userName aliases so frontend keeps working
    return {
      ...trip,
      userId: trip.ownerId,
      userName: trip.ownerName,
    };
  }

  return {
    ...trip,
    ownerId: trip.userId,
    ownerName: trip.userName,
    participants: [
      {
        userId: trip.userId,
        userName: trip.userName,
        photoKeys: trip.photoKeys || [],
        status: 'accepted',
      }
    ],
  };
}

// Returns the owner id regardless of trip format
function getOwnerId(trip) {
  return trip.ownerId || trip.userId;
}

// Collects all photoKeys across all participants (new format) or top-level (old format)
function getAllPhotoKeys(trip) {
  if (trip.ownerId && trip.participants) {
    return trip.participants.flatMap(p => p.photoKeys || []);
  }
  return trip.photoKeys || [];
}

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
      filter = {
        $or: [
          { userId: { $in: [...friendIds, decoded.userId] } },
          { ownerId: { $in: [...friendIds, decoded.userId] } },
          { 'participants.userId': decoded.userId, 'participants.status': 'accepted' },
        ]
      };
    } else {
      filter = {
        $or: [
          { userId: { $in: [...friendIds, decoded.userId, 'anonymous'] } },
          { ownerId: { $in: [...friendIds, decoded.userId] } },
          { 'participants.userId': decoded.userId, 'participants.status': 'accepted' },
        ]
      };
    }

    if (before) {
      filter.createdAt = { $lt: new Date(before) };
    }

    const PAGE_SIZE = 10;
    const allTrips = await trips
      .find(filter, { projection: { gpsPoints: 0, userEmail: 0 } })
      .sort({ createdAt: -1 })
      .limit(PAGE_SIZE + 1)
      .toArray();

    const hasMore = allTrips.length > PAGE_SIZE;
    if (hasMore) allTrips.pop();

    const authorIds = [...new Set(
      allTrips.map(t => getOwnerId(t)).filter(id => id && id !== 'anonymous')
    )];
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

    const normalized = allTrips.map(t => {
      const n = normalizeTrip(t);
      return {
        ...n,
        userProfilePictureUrl: profilePicMap[getOwnerId(t)] || null,
      };
    });

    res.json({ datasets: normalized, hasMore });
  } catch (error) {
    console.error('Fetch trips error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST / — create a trip. gpsPoints and photoKeys are optional so a trip can be
// created in 'pending' state before recording has started.
router.post('/', authenticateAPIKeyOrToken, async (req, res) => {
  try {
    const db = getDb();
    const trips = db.collection('trips');

    const { gpsPoints, photoKeys, totalPhotoSize, timestamp, totalPoints, photoCount, title, description, status } = req.body;

    if (gpsPoints !== undefined && (!Array.isArray(gpsPoints) || gpsPoints.length === 0)) {
      return res.status(400).json({ message: 'gpsPoints must be a non-empty array if provided' });
    }

    let ownerId = 'anonymous';
    let ownerName = null;
    let userEmail = null;
    if (req.user) {
      const user = await db.collection('user_credentals').findOne({ _id: new ObjectId(req.user.userId) });
      if (user) {
        ownerId = req.user.userId;
        ownerName = user.name || null;
        userEmail = user.email;
      }
    }

    const keys = Array.isArray(photoKeys) ? photoKeys : [];
    const tripStatus = status === 'active' ? 'active' : 'pending';

    const trip = {
      ownerId,
      ownerName,
      userEmail,
      status: tripStatus,
      participants: [
        {
          userId: ownerId,
          userName: ownerName,
          photoKeys: keys,
          status: 'accepted',
        }
      ],
      totalPhotoSize: totalPhotoSize || 0,
      photoCount: photoCount || keys.length,
      totalPoints: totalPoints || (gpsPoints ? gpsPoints.length : 0),
      timestamp: new Date(timestamp || new Date()),
      createdAt: new Date(),
      title: title ? title.trim() : '',
      description: description ? description.trim() : '',
    };

    const result = await trips.insertOne(trip);

    if (gpsPoints && gpsPoints.length > 0) {
      const locationDocs = gpsPoints.map(point => ({
        userId: ownerId,
        latitude: point.latitude,
        longitude: point.longitude,
        altitude: point.altitude || 0,
        speed: point.speed || 0,
        accuracy: point.accuracy || 0,
        timestamp: new Date(point.timestamp),
        createdAt: new Date(),
        tripId: result.insertedId
      }));
      await db.collection('locations').insertMany(locationDocs);
    }

    res.status(201).json({
      message: 'Trip saved successfully',
      tripId: result.insertedId,
      pointsSaved: gpsPoints ? gpsPoints.length : 0,
      photoCount: keys.length,
      status: tripStatus,
    });
  } catch (error) {
    console.error('Save trip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id/points', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const trip = await db.collection('trips').findOne(
      { _id: new ObjectId(req.params.id) }
    );

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Old format — return single track for backward compatibility
    if (!trip.ownerId) {
      return res.json({ tracks: [{ userId: trip.userId, userName: trip.userName, gpsPoints: trip.gpsPoints || [] }] });
    }

    // New format — fetch each participant's track from locations collection
    const locationDocs = await db.collection('locations')
      .find({ tripId: trip._id })
      .sort({ timestamp: 1 })
      .toArray();

    // Group by userId
    const trackMap = {};
    locationDocs.forEach(loc => {
      if (!trackMap[loc.userId]) trackMap[loc.userId] = [];
      trackMap[loc.userId].push(loc);
    });

    const participants = trip.participants || [];
    const tracks = participants
      .filter(p => p.status === 'accepted')
      .map(p => ({
        userId: p.userId,
        userName: p.userName,
        gpsPoints: trackMap[p.userId] || [],
      }));

    res.json({ tracks });
  } catch (error) {
    console.error('Fetch trip points error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/gps', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const trips = db.collection('trips');

    const trip = await trips.findOne({ _id: new ObjectId(req.params.id) });
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    const participant = (trip.participants || []).find(
      p => p.userId === req.user.userId && p.status === 'accepted'
    );
    if (!participant) {
      return res.status(403).json({ message: 'You are not an active participant of this trip' });
    }

    const { gpsPoints } = req.body;
    if (!gpsPoints || !Array.isArray(gpsPoints) || gpsPoints.length === 0) {
      return res.status(400).json({ message: 'gpsPoints array is required' });
    }

    const locationDocs = gpsPoints.map(point => ({
      userId: req.user.userId,
      latitude: point.latitude,
      longitude: point.longitude,
      altitude: point.altitude || 0,
      speed: point.speed || 0,
      accuracy: point.accuracy || 0,
      timestamp: new Date(point.timestamp),
      createdAt: new Date(),
      tripId: trip._id,
    }));

    await db.collection('locations').insertMany(locationDocs);

    // Update totalPoints count
    await trips.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $inc: { totalPoints: gpsPoints.length } }
    );

    res.json({ message: 'GPS points saved', pointsSaved: gpsPoints.length });
  } catch (error) {
    console.error('Save participant GPS error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id/photos', async (req, res) => {
  try {
    const db = getDb();
    const trip = await db.collection('trips').findOne(
      { _id: new ObjectId(req.params.id) }
    );

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const allPhotoKeys = getAllPhotoKeys(trip);

    if (allPhotoKeys.length === 0) {
      return res.json({ photos: [] });
    }

    const photos = await db.collection('photos')
      .find({ photoKey: { $in: allPhotoKeys } })
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

router.post('/:id/join', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const trips = db.collection('trips');

    const trip = await trips.findOne({ _id: new ObjectId(req.params.id) });
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    // Only allow joining pending or active trips
    if (trip.status === 'completed') {
      return res.status(400).json({ message: 'This trip has already ended' });
    }

    if (getOwnerId(trip) === req.user.userId) {
      return res.status(400).json({ message: 'You are the owner of this trip' });
    }

    const existing = (trip.participants || []).find(p => p.userId === req.user.userId);
    if (existing && existing.status === 'accepted') {
      return res.status(409).json({ message: 'Already joined this trip' });
    }

    const user = await db.collection('user_credentals').findOne({
      _id: new ObjectId(req.user.userId)
    });

    if (existing) {
      // Re-joining after leaving — update status back to accepted
      await trips.updateOne(
        { _id: new ObjectId(req.params.id), 'participants.userId': req.user.userId },
        { $set: { 'participants.$.status': 'accepted' } }
      );
    } else {
      await trips.updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $push: {
            participants: {
              userId: req.user.userId,
              userName: user?.name || null,
              photoKeys: [],
              status: 'accepted',
            }
          }
        }
      );
    }

    res.json({
      message: 'Joined trip successfully',
      trip: {
        id: trip._id,
        title: trip.title,
        ownerName: trip.ownerName,
        status: trip.status,
      }
    });
  } catch (error) {
    console.error('Join trip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /:id/participants — returns all participants and their status
router.get('/:id/participants', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const trip = await db.collection('trips').findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { participants: 1, ownerId: 1, ownerName: 1, status: 1, title: 1 } }
    );
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    const participants = (trip.participants || []).map(p => ({
      userId: p.userId,
      userName: p.userName,
      status: p.status,
      photoCount: (p.photoKeys || []).length,
      isOwner: p.userId === (trip.ownerId || trip.userId),
    }));

    res.json({
      tripId: trip._id,
      title: trip.title,
      tripStatus: trip.status || 'active',
      ownerId: trip.ownerId,
      participants,
    });
  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /:id/start — owner starts the trip (pending → active)
router.post('/:id/start', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const trips = db.collection('trips');

    const trip = await trips.findOne({ _id: new ObjectId(req.params.id) });
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    if (getOwnerId(trip) !== req.user.userId) {
      return res.status(403).json({ message: 'Only the owner can start the trip' });
    }

    if (trip.status === 'completed') {
      return res.status(400).json({ message: 'Trip has already ended' });
    }

    await trips.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: 'active', startedAt: new Date() } }
    );

    res.json({ message: 'Trip started', status: 'active' });
  } catch (error) {
    console.error('Start trip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /:id/end — owner ends the trip (active → completed)
router.post('/:id/end', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const trips = db.collection('trips');

    const trip = await trips.findOne({ _id: new ObjectId(req.params.id) });
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    if (getOwnerId(trip) !== req.user.userId) {
      return res.status(403).json({ message: 'Only the owner can end the trip' });
    }

    if (trip.status === 'completed') {
      return res.status(400).json({ message: 'Trip is already completed' });
    }

    await trips.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: 'completed', endedAt: new Date() } }
    );

    res.json({ message: 'Trip ended', status: 'completed' });
  } catch (error) {
    console.error('End trip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id/preview', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const trip = await db.collection('trips').findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { title: 1, ownerName: 1, participants: 1, createdAt: 1 } }
    );
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    res.json({ trip });
  } catch (error) {
    console.error('Preview trip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id/leave', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const trips = db.collection('trips');
    const photosCollection = db.collection('photos');

    const trip = await trips.findOne({ _id: new ObjectId(req.params.id) });
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    if (getOwnerId(trip) === req.user.userId) {
      return res.status(403).json({ message: 'Owner cannot leave — delete the trip instead' });
    }

    const participant = (trip.participants || []).find(p => p.userId === req.user.userId);
    if (!participant) {
      return res.status(404).json({ message: 'You are not a participant of this trip' });
    }

    const { deleteData } = req.body;

    if (deleteData) {
      // Remove their photos from Azure + photos collection
      const theirKeys = participant.photoKeys || [];
      for (const key of theirKeys) {
        try {
          await containerClient.getBlobClient(key).deleteIfExists();
        } catch (err) {
          console.error(`Failed to delete blob ${key}:`, err);
        }
      }
      if (theirKeys.length > 0) {
        await photosCollection.deleteMany({ photoKey: { $in: theirKeys } });
      }

      // Remove participant entry entirely and update counts
      await trips.updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $pull: { participants: { userId: req.user.userId } },
          $inc: {
            photoCount: -(theirKeys.length),
          }
        }
      );
    } else {
      // Just mark as left — keep their photos in the trip
      await trips.updateOne(
        { _id: new ObjectId(req.params.id), 'participants.userId': req.user.userId },
        { $set: { 'participants.$.status': 'left' } }
      );
    }

    res.json({ message: 'Left trip successfully' });
  } catch (error) {
    console.error('Leave trip error:', error);
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

    if (getOwnerId(trip) !== req.user.userId) {
      return res.status(403).json({ message: 'You can only delete your own trips' });
    }

    const allPhotoKeys = getAllPhotoKeys(trip);
    if (allPhotoKeys.length > 0) {
      for (const key of allPhotoKeys) {
        try {
          const blobClient = containerClient.getBlobClient(key);
          await blobClient.deleteIfExists();
        } catch (err) {
          console.error(`Failed to delete blob ${key}:`, err);
        }
      }
      await photosCollection.deleteMany({ photoKey: { $in: allPhotoKeys } });
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

    if (getOwnerId(trip) !== req.user.userId) {
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
