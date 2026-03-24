const { Router } = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { generateSasUrl } = require('../azure');
const { authenticateToken } = require('../middleware/auth');

const router = Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const friendRequests = db.collection('friend_requests');

    const friendDocs = await friendRequests.find({
      $or: [
        { senderId: req.user.userId, status: 'accepted' },
        { receiverId: req.user.userId, status: 'accepted' }
      ]
    }).toArray();

    const friends = friendDocs.map(doc => {
      if (doc.senderId === req.user.userId) {
        return { id: doc.receiverId, name: doc.receiverName };
      }
      return { id: doc.senderId, name: doc.senderName };
    });

    const friendIds = friends.map(f => f.id).filter(id => id);
    const friendUsers = await db.collection('user_credentals').find(
      { _id: { $in: friendIds.map(id => new ObjectId(id)) } },
      { projection: { profilePictureKey: 1 } }
    ).toArray();

    const picMap = {};
    friendUsers.forEach(u => {
      if (u.profilePictureKey) picMap[u._id.toString()] = generateSasUrl(u.profilePictureKey);
    });

    const enrichedFriends = friends.map(f => ({
      ...f,
      profilePictureUrl: picMap[f.id] || null,
    }));

    res.json({ friends: enrichedFriends });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:friendId', authenticateToken, async (req, res) => {
  try {
    const friendRequests = getDb().collection('friend_requests');
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

router.post('/request', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const users = db.collection('user_credentals');
    const friendRequests = db.collection('friend_requests');
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ message: 'receiverId is required' });
    }

    if (receiverId === req.user.userId) {
      return res.status(400).json({ message: 'Cannot send friend request to yourself' });
    }

    const receiver = await users.findOne({ _id: new ObjectId(receiverId) });
    if (!receiver) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existing = await friendRequests.findOne({
      $or: [
        { senderId: req.user.userId, receiverId, status: { $in: ['pending', 'accepted'] } },
        { senderId: receiverId, receiverId: req.user.userId, status: { $in: ['pending', 'accepted'] } }
      ]
    });
    if (existing) {
      return res.status(400).json({ message: 'Friend request already exists' });
    }

    const sender = await users.findOne({ _id: new ObjectId(req.user.userId) });

    await friendRequests.insertOne({
      senderId: req.user.userId,
      senderName: sender?.name || null,
      senderEmail: sender?.email || req.user.email,
      receiverId,
      receiverName: receiver.name || null,
      receiverEmail: receiver.email,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.status(201).json({ message: 'Friend request sent' });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/requests/sent', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const requests = await db.collection('friend_requests')
      .find({ senderId: req.user.userId, status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();

    const receiverIds = requests.map(r => r.receiverId).filter(id => id);
    const receivers = await db.collection('user_credentals').find(
      { _id: { $in: receiverIds.map(id => new ObjectId(id)) } },
      { projection: { profilePictureKey: 1 } }
    ).toArray();

    const picMap = {};
    receivers.forEach(u => {
      if (u.profilePictureKey) picMap[u._id.toString()] = generateSasUrl(u.profilePictureKey);
    });

    const enrichedRequests = requests.map(r => ({
      _id: r._id,
      receiverId: r.receiverId,
      receiverName: r.receiverName,
      receiverProfilePictureUrl: picMap[r.receiverId] || null,
      status: r.status,
      createdAt: r.createdAt,
    }));

    res.json({ requests: enrichedRequests });
  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const friendRequests = db.collection('friend_requests');

    const requests = await friendRequests
      .find({ receiverId: req.user.userId, status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();

    const senderIds = requests.map(r => r.senderId).filter(id => id);
    const senders = await db.collection('user_credentals').find(
      { _id: { $in: senderIds.map(id => new ObjectId(id)) } },
      { projection: { profilePictureKey: 1 } }
    ).toArray();

    const picMap = {};
    senders.forEach(u => {
      if (u.profilePictureKey) picMap[u._id.toString()] = generateSasUrl(u.profilePictureKey);
    });

    const enrichedRequests = requests.map(r => ({
      _id: r._id,
      senderId: r.senderId,
      senderName: r.senderName,
      senderProfilePictureUrl: picMap[r.senderId] || null,
      status: r.status,
      createdAt: r.createdAt,
    }));

    res.json({ requests: enrichedRequests });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/request/:id', authenticateToken, async (req, res) => {
  try {
    const friendRequests = getDb().collection('friend_requests');

    const request = await friendRequests.findOne({ _id: new ObjectId(req.params.id) });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.senderId !== req.user.userId) return res.status(403).json({ message: 'Not authorized' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'Request already handled' });

    await friendRequests.deleteOne({ _id: new ObjectId(req.params.id) });

    res.json({ message: 'Friend request cancelled' });
  } catch (error) {
    console.error('Cancel friend request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/request/:id/accept', authenticateToken, async (req, res) => {
  try {
    const friendRequests = getDb().collection('friend_requests');

    const request = await friendRequests.findOne({ _id: new ObjectId(req.params.id) });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.receiverId !== req.user.userId) return res.status(403).json({ message: 'Not authorized' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'Request already handled' });

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

router.put('/request/:id/reject', authenticateToken, async (req, res) => {
  try {
    const friendRequests = getDb().collection('friend_requests');

    const request = await friendRequests.findOne({ _id: new ObjectId(req.params.id) });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.receiverId !== req.user.userId) return res.status(403).json({ message: 'Not authorized' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'Request already handled' });

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

module.exports = router;
