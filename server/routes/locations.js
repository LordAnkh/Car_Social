const { Router } = require('express');
const { getDb } = require('../db');
const { authenticateToken, authenticateAPIKey } = require('../middleware/auth');

const router = Router();

router.post('/', authenticateAPIKey, async (req, res) => {
  try {
    const locations = getDb().collection('locations');
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

router.post('/batch', authenticateAPIKey, async (req, res) => {
  try {
    const locations = getDb().collection('locations');
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

router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const locations = getDb().collection('locations');
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

module.exports = router;
