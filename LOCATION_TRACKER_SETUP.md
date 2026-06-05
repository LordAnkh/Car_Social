# Location Tracker Setup Guide

## Overview
Your phonetracker.html is now connected to MongoDB! Location data is stored in the `locations` collection and associated with users.

## 📍 Location Data Schema

```javascript
{
  _id: ObjectId,
  userId: string,           // User ID or "anonymous"
  latitude: number,
  longitude: number,
  altitude: number,
  speed: number,
  accuracy: number,
  timestamp: Date,          // When location was recorded
  createdAt: Date          // When saved to database
}
```

## 🚀 How to Use

### 1. Start Your Server
```bash
npm run server
```

Server will run on `http://localhost:5000`

### 2. Access the Tracker

**On Desktop/Laptop:**
- Open browser to: `http://localhost:5000/tracker.html`

**On Phone (same WiFi network):**
- Find your computer's local IP address:
  - Windows: `ipconfig` → look for "IPv4 Address"
  - Mac/Linux: `ifconfig` → look for "inet"
- Example: `192.168.1.100`
- Open browser on phone: `http://192.168.1.100:5000/tracker.html`

### 3. Configure the Tracker

In the tracker app, set:
- **Server URL**: `http://192.168.1.100:5000` (or your IP)
- **API Key**: `car-tracker-2024` (from your .env file)
- **Update Interval**: Choose how often to send location (10 sec recommended)

### 4. Start Tracking
- Tap "START TRACKING"
- Grant location permissions when prompted
- Location will be sent to MongoDB every 10 seconds (or your chosen interval)

## 🔑 API Endpoints

**Save single location:**
```
POST /api/location
Headers: X-API-Key: YOUR_LOCATION_API_KEY
Body: { latitude, longitude, altitude, speed, accuracy, timestamp, userId }
```

**Save batch locations (offline buffer):**
```
POST /api/locations/batch
Headers: X-API-Key: YOUR_LOCATION_API_KEY
Body: { locations: [...], userId }
```

**Get user locations:**
```
GET /api/locations/:userId
Headers: Authorization: Bearer <jwt-token>
Query params: startDate, endDate, limit
```

## 📱 Features

- **Real-time GPS tracking** - Updates every 10 seconds (configurable)
- **Offline buffering** - Stores locations when offline, sends when back online
- **Wake lock** - Keeps screen awake during tracking (on supported devices)
- **Activity log** - See all location updates in real-time
- **Session stats** - Points logged, sent, and buffered

## 🔐 Security

- API key authentication prevents unauthorized access
- Optional userId association for user-specific tracking
- JWT authentication required to view location history

## 💡 Tips

- Use over WiFi initially to test - cellular data may be blocked by CORS
- For production, deploy to a cloud server with HTTPS
- The tracker works best on mobile devices for actual GPS tracking
- Desktop/laptop will use WiFi positioning (less accurate)

## 🌐 Production Deployment

For real-world use:
1. Deploy server to Heroku, Railway, or similar
2. Get a domain with HTTPS
3. Update Server URL in tracker to your domain
4. Enable geolocation permissions in browser

## 📊 MongoDB Collections

**locations** - All GPS tracking data
- Query by userId to see user's location history
- Query by timestamp for date ranges
- Indexed on userId and timestamp for fast queries
