const { Router } = require('express');
const sharp = require('sharp');
const { getDb } = require('../db');
const { containerClient } = require('../azure');
const { authenticateAPIKeyOrToken } = require('../middleware/auth');

const router = Router();

// Max 2048px on longest side, WebP at quality 82 — visually lossless, ~60-70% smaller than original JPEG
async function processImage(buffer) {
  return sharp(buffer)
    .rotate() // auto-rotate based on EXIF orientation
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
}

router.post('/upload', authenticateAPIKeyOrToken, async (req, res) => {
  try {
    const { base64, size, timestamp, location } = req.body;

    if (!base64) {
      return res.status(400).json({ message: 'base64 image data is required' });
    }

    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const rawBuffer = Buffer.from(base64Data, 'base64');

    const compressed = await processImage(rawBuffer);

    const photoKey = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.webp`;

    const blockBlobClient = containerClient.getBlockBlobClient(photoKey);
    await blockBlobClient.uploadData(compressed, {
      blobHTTPHeaders: { blobContentType: 'image/webp' },
    });

    const photoUrl = blockBlobClient.url;

    const photos = getDb().collection('photos');
    const result = await photos.insertOne({
      photoKey,
      url: photoUrl,
      filename: photoKey,
      size: compressed.length,
      originalSize: rawBuffer.length,
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
