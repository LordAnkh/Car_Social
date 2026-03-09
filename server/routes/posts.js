const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

router.get('/user/:userId', async (req, res) => {
  try {
    const posts = getDb().collection('posts');

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

module.exports = router;
