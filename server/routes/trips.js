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
  if (trip.ownerId) return trip; // already new format

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

    const trip = {
      ownerId,
      ownerName,
      userEmail,
      participants: [
        {
          userId: ownerId,
          userName: ownerName,
          photoKeys,
          status: 'accepted',
        }
      ],
      totalPhotoSize: totalPhotoSize || 0,
      photoCount: photoCount || photoKeys.length,
      totalPoints: totalPoints || gpsPoints.length,
      timestamp: new Date(timestamp || new Date()),
      createdAt: new Date(),
      title: title ? title.trim() : '',
      description: description ? description.trim() : '',
    };

    const result = await trips.insertOne(trip);

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

router.get('/:id/points', authenticateToken, async (req, res) => {
  try {
    const trip = await getDb().collection('trips').findOne(
      { _id: new ObjectId(req.params.id) }
    );

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Old format: gpsPoints at top level
    // New format: gpsPoints stored per participant in locations collection by tripId
    const gpsPoints = trip.gpsPoints || [];
    res.json({ gpsPoints });
  } catch (error) {
    console.error('Fetch trip points error:', error);
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

    const existing = (trip.participants || []).find(p => p.userId === req.user.userId);
    if (existing) return res.status(409).json({ message: 'Already joined this trip' });

    if (getOwnerId(trip) === req.user.userId) {
      return res.status(400).json({ message: 'You are the owner of this trip' });
    }

    const user = await db.collection('user_credentals').findOne({
      _id: new ObjectId(req.user.userId)
    });

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

    res.json({
      message: 'Joined trip successfully',
      trip: {
        id: trip._id,
        title: trip.title,
        ownerName: trip.ownerName,
      }
    });
  } catch (error) {
    console.error('Join trip error:', error);
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
