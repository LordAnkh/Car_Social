# Cork Board — Server Context

## Stack
- Node.js + Express on port 5000
- MongoDB (`Car_Database`)
- Azure Blob Storage (photos)
- JWT auth (24h expiry)
- Rate limiting on login (30 attempts / 15 min)

## Environment Variables Required
```
MONGODB_URI
JWT_SECRET
AZURE_STORAGE_CONNECTION_STRING
AZURE_CONTAINER_NAME
LOCATION_API_KEY
GOOGLE_CLIENT_ID
APPLE_BUNDLE_ID
APPLE_TEAM_ID
```

---

## Authentication

All protected endpoints require:
```
Authorization: Bearer <jwt>
```

JWT payload contains: `{ userId, email }`

---

## Endpoints

### Auth — `/api`

| Method | Endpoint | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/api/login` | None | `{ email, password }` | `{ token, user }` |
| POST | `/api/signup` | None | `{ email, password, name }` | `{ message }` |
| POST | `/api/refresh` | Bearer | — | `{ token }` |
| POST | `/api/auth/google` | None | `{ idToken }` | `{ token, user }` |
| POST | `/api/auth/apple` | None | `{ idToken, name? }` | `{ token, user }` |

**user object returned on login/oauth:**
```json
{
  "id": "string",
  "email": "string",
  "name": "string",
  "profilePictureUrl": "string|null"
}
```

---

### Trips — `/api/trips`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/trips` | Bearer | Paginated feed — `?visibility=public\|friends&before=<ISO>` |
| POST | `/api/trips` | Bearer or API Key | Create trip |
| GET | `/api/trips/:id/points` | Bearer | Per-participant GPS tracks |
| GET | `/api/trips/:id/photos` | None | All photos for a trip |
| GET | `/api/trips/:id/preview` | Bearer | Lightweight preview before joining |
| GET | `/api/trips/:id/participants` | Bearer | All participants + status |
| POST | `/api/trips/:id/join` | Bearer | Join a pending or active trip |
| POST | `/api/trips/:id/start` | Bearer (owner) | Start trip — pending → active |
| POST | `/api/trips/:id/end` | Bearer (owner) | End trip — active → completed |
| POST | `/api/trips/:id/gps` | Bearer | Submit your GPS track |
| DELETE | `/api/trips/:id/leave` | Bearer | Leave trip — body: `{ deleteData: bool }` |
| PUT | `/api/trips/:id` | Bearer (owner) | Edit `{ title, description }` |
| DELETE | `/api/trips/:id` | Bearer (owner) | Delete trip + all photos |

**Trip object (feed response):**
```json
{
  "_id": "string",
  "ownerId": "string",
  "ownerName": "string",
  "userId": "string",
  "userName": "string",
  "status": "pending|active|completed",
  "participants": [
    {
      "userId": "string",
      "userName": "string",
      "photoKeys": ["string"],
      "status": "accepted|left",
      "gpsPoints": [
        { "latitude": 0, "longitude": 0, "altitude": 0, "speed": 0, "timestamp": "ISO" }
      ]
    }
  ],
  "photoCount": 0,
  "totalPoints": 0,
  "timestamp": "ISO",
  "createdAt": "ISO",
  "title": "string",
  "description": "string",
  "userProfilePictureUrl": "string|null"
}
```

> `userId` and `userName` are always present as aliases for `ownerId`/`ownerName` for backward compatibility.

**POST `/api/trips` body:**
```json
{
  "title": "string (optional)",
  "description": "string (optional)",
  "gpsPoints": "(optional array)",
  "photoKeys": "(optional array)",
  "status": "pending|active (default: pending)"
}
```

**GET `/api/trips/:id/points` response:**
```json
{
  "tracks": [
    { "userId": "string", "userName": "string", "gpsPoints": [] }
  ]
}
```

**GET `/api/trips/:id/participants` response:**
```json
{
  "tripId": "string",
  "title": "string",
  "tripStatus": "pending|active|completed",
  "ownerId": "string",
  "participants": [
    { "userId": "string", "userName": "string", "status": "accepted|left", "photoCount": 0, "isOwner": true }
  ]
}
```

**Trip status rules:**
- Anyone can join a `pending` or `active` trip
- No one can join a `completed` trip
- Only owner can call `/start` and `/end`
- Owner cannot leave — must delete instead

**Ownership checks:**
```
isOwner    → trip.ownerId === currentUserId
isJoined   → trip.participants.some(p => p.userId === currentUserId && p.status === 'accepted')
canEdit    → trip.ownerId === currentUserId
canLeave   → isJoined && !isOwner
```

---

### Photos — `/api/photos`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/photos/upload` | Bearer or API Key | Upload photo, returns `{ photoKey, url }` |

---

### Locations — `/api/location` or `/api/locations`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/location` | API Key | Single GPS point (live tracker) |
| POST | `/api/location/batch` | API Key | Batch GPS points (live tracker) |
| GET | `/api/locations/:userId` | Bearer | Get locations for a user — `?startDate&endDate&limit` |

> Live tracker uses API Key (`x-api-key` header). Trip GPS uses Bearer token via `POST /api/trips/:id/gps`.

---

### Users — `/api`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/me` | Bearer | Current user profile |
| PUT | `/api/profile` | Bearer | Update `{ name }` |
| POST | `/api/profile/picture` | Bearer | Upload profile picture (base64) |
| GET | `/api/users/search?q=` | Bearer | Search users by name |

**Search result:**
```json
{ "_id": "string", "name": "string", "friendStatus": "none|pending|accepted", "profilePictureUrl": "string|null" }
```

---

### Friends — `/api/friends`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/friends/request` | Bearer | Send request — body: `{ receiverId }` |
| GET | `/api/friends/requests` | Bearer | Incoming pending requests |
| GET | `/api/friends/requests/sent` | Bearer | Sent pending requests |
| PUT | `/api/friends/request/:id/accept` | Bearer | Accept a request |
| PUT | `/api/friends/request/:id/reject` | Bearer | Reject a request |
| GET | `/api/friends` | Bearer | Friends list |
| DELETE | `/api/friends/:friendId` | Bearer | Remove a friend |

**Incoming request object:**
```json
{ "_id": "string", "senderId": "string", "senderName": "string", "senderProfilePictureUrl": "string|null", "status": "pending", "createdAt": "ISO" }
```

**Sent request object:**
```json
{ "_id": "string", "receiverId": "string", "receiverName": "string", "receiverProfilePictureUrl": "string|null", "status": "pending", "createdAt": "ISO" }
```

**Friend object:**
```json
{ "id": "string", "name": "string", "profilePictureUrl": "string|null" }
```

> Emails are never returned in any friends or search response.

---

### Posts — `/api/posts`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/posts/user/:userId` | Bearer | Posts by a user |

---

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `user_credentals` | Users — `{ email, password, name, oauthProvider, oauthId, profilePictureKey }` |
| `trips` | Trips — participants + gpsPoints embedded per participant |
| `photos` | Photo metadata — `{ photoKey, url, tripId, userId, timestamp, location }` |
| `locations` | Live tracker points (not trip GPS) |
| `friend_requests` | `{ senderId, receiverId, status: pending|accepted|rejected }` |

## Notes
- SAS photo URLs expire after 24h
- GPS points stored inside `trip.participants[i].gpsPoints` — no separate locations query needed for trips
- Old trips (pre-multi-participant) use `userId`/`userName` instead of `ownerId`/`ownerName` — server normalizes these automatically
- Apple Sign In only sends `name` on the very first login — must be saved immediately
