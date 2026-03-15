const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { connectDb } = require('./db');
const { ensureContainer } = require('./azure');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../build')));

app.use('/api', require('./routes/auth'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/location', require('./routes/locations'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api', require('./routes/users'));
app.use('/api/friends', require('./routes/friends'));

app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

async function startServer() {
  try {
    await connectDb();
    await ensureContainer();
    app.listen(5000, () => console.log('Server running on port 5000'));
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}
startServer();
