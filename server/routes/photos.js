const { Router } = require('express');
const { getDb } = require('../db');
const { containerClient } = require('../azure');
const { authenticateAPIKeyOrToken } = require('../middleware/auth');

const router = Router();

router.post('/upload', authenticateAPIKeyOrToken, async (req, res) => {
  try {
    const { base64, size, timestamp, location } = req.body;

    if (!base64) {
      return res.status(400).json({ message: 'base64 image data is required' });
    }

    const photoKey = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`;
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const blockBlobClient = containerClient.getBlockBlobClient(photoKey);
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: 'image/jpeg' },
    });

    const photoUrl = blockBlobClient.url;

    const photos = getDb().collection('photos');
    const result = await photos.insertOne({
      photoKey,
      url: photoUrl,
      filename: photoKey,
      size: size || buffer.length,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      location: location || null,
      createdAt: new Date(),
    });

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

module.exports = router;
