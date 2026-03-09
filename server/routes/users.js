const { Router } = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { generateSasUrl, containerClient } = require('../azure');
const { authenticateToken } = require('../middleware/auth');

const router = Router();

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const users = getDb().collection('user_credentals');
    const user = await users.findOne({ _id: new ObjectId(req.user.userId) });
    if (!user) return res.status(404).json({ message: 'User not found' });

    let profilePictureUrl = null;
    if (user.profilePictureKey) {
      profilePictureUrl = generateSasUrl(user.profilePictureKey);
    }

    res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      profilePictureUrl,
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const users = getDb().collection('user_credentals');
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const existingName = await users.findOne({
      name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      _id: { $ne: new ObjectId(req.user.userId) },
    });
    if (existingName) {
      return res.status(400).json({ message: 'Username already taken' });
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

router.post('/profile/picture', authenticateToken, async (req, res) => {
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

    await getDb().collection('user_credentals').updateOne(
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

router.get('/users/search', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
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
      const profilePictureUrl = u.profilePictureKey ? generateSasUrl(u.profilePictureKey) : null;
      return { _id: uid, name: u.name, email: u.email, friendStatus, profilePictureUrl };
    });

    res.json({ users: enriched });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
