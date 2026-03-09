const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Error: Could not load MONGODB_URI. Ensure .env exists in project root and is UTF-8 encoded.');
  throw new Error('MONGODB_URI environment variable is not defined');
}

const client = new MongoClient(uri, {
  family: 4,
  maxPoolSize: 5,
  minPoolSize: 1,
  maxIdleTimeMS: 30000,
});

async function connectDb() {
  await client.connect();
  console.log('Connected to MongoDB');
}

function getDb() {
  return client.db('Car_Database');
}

module.exports = { client, connectDb, getDb };
