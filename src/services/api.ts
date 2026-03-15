const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5000/api'
  : 'https://az318test.uk/api';


export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface SignupResponse {
  message: string;
}

export interface CreatePostResponse {
  message?: string;
}

export const authService = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    return data;
  },

  signup: async (email: string, password: string, name?: string): Promise<SignupResponse> => {
    const response = await fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Signup failed');
    }

    return data;
  },
};



export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  accuracy: number;
  timestamp: string;
}

export interface Photo {
  _id: string;
  photoKey: string;
  url: string;
  filename: string;
  size: number;
  timestamp: string;
  location?: {
    latitude: number;
    longitude: number;
    altitude: number;
    accuracy: number;
  };
}

export interface TripParticipant {
  userId: string;
  userName?: string;
  photoKeys: string[];
  status: 'accepted' | 'left' | 'pending';
}

export interface Trip {
  _id: string;
  photoCount: number;
  totalPoints: number;
  timestamp: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  status?: 'pending' | 'active' | 'completed';
  // normalized aliases — always present regardless of trip age
  userId: string;
  userName?: string;
  // new format fields
  ownerId?: string;
  ownerName?: string;
  participants?: TripParticipant[];
  title: string;
  description: string;
  userProfilePictureUrl?: string;
}

export interface TripParticipantDetail {
  userId: string;
  userName?: string;
  status: 'accepted' | 'left' | 'pending';
  photoCount: number;
  isOwner: boolean;
}

export interface GetParticipantsResponse {
  tripId: string;
  title: string;
  tripStatus: 'pending' | 'active' | 'completed';
  ownerId: string;
  participants: TripParticipantDetail[];
}

export interface GetTripsResponse {
  datasets: Trip[];
  hasMore: boolean;
}

const getToken = () => localStorage.getItem('token');

const authHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function refreshTokenIfNeeded(): Promise<void> {
  const token = getToken();
  if (!token) return;

  const expiry = getTokenExpiry(token);
  if (!expiry) return;

  const msUntilExpiry = expiry - Date.now();
  // Refresh if less than 2 hours remaining
  if (msUntilExpiry > 2 * 60 * 60 * 1000) return;

  try {
    const response = await fetch(`${API_BASE}/refresh`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('token', data.token);
    } else {
      // Token is expired/invalid — force logout
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('tokenExpired'));
    }
  } catch {
    // Silently fail — token will expire naturally
  }
}

// Proactively check token every 30 minutes
setInterval(refreshTokenIfNeeded, 30 * 60 * 1000);
// Also check on load
refreshTokenIfNeeded();

export type FeedVisibility = 'public' | 'friends';

export const getVisibility = (): FeedVisibility => {
  return (localStorage.getItem('feedVisibility') as FeedVisibility) || 'public';
};

export const setVisibility = (v: FeedVisibility) => {
  localStorage.setItem('feedVisibility', v);
};

export const tripService = {
  getAllTrips: async (before?: string): Promise<GetTripsResponse> => {
    const visibility = getVisibility();
    const params = new URLSearchParams({ visibility });
    if (before) params.set('before', before);
    const response = await fetch(`${API_BASE}/trips?${params}`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch trips');
    }

    return response.json();
  },

  getTripPoints: async (tripId: string): Promise<{ tracks: { userId: string; userName?: string; gpsPoints: GpsPoint[] }[] }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/points`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch trip GPS points');
    }

    return response.json();
  },

  getTripPhotos: async (tripId: string): Promise<{ photos: Photo[] }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/photos`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch trip photos');
    }

    return response.json();
  },

  deleteTrip: async (tripId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to delete trip');
    }

    return data;
  },

  updateTrip: async (tripId: string, updates: { title?: string; description?: string }): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(updates),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update trip');
    }

    return data;
  },

  previewTrip: async (tripId: string): Promise<{ trip: Partial<Trip> }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/preview`, {
      method: 'GET',
      headers: authHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to preview trip');
    return data;
  },

  joinTrip: async (tripId: string): Promise<{ message: string; trip: { id: string; title: string; ownerName: string; status: string } }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/join`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to join trip');
    return data;
  },

  getParticipants: async (tripId: string): Promise<GetParticipantsResponse> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/participants`, {
      method: 'GET',
      headers: authHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to get participants');
    return data;
  },

  startTrip: async (tripId: string): Promise<{ message: string; status: string }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/start`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to start trip');
    return data;
  },

  endTrip: async (tripId: string): Promise<{ message: string; status: string }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/end`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to end trip');
    return data;
  },

  leaveTrip: async (tripId: string, deleteData: boolean): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/leave`, {
      method: 'DELETE',
      headers: authHeaders(),
      body: JSON.stringify({ deleteData }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to leave trip');
    return data;
  },

  submitGps: async (tripId: string, gpsPoints: GpsPoint[]): Promise<{ message: string; pointsSaved: number }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/gps`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ gpsPoints }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to submit GPS points');
    return data;
  },
};

// ===== Friends System =====

export interface UserSearchResult {
  _id: string;
  name?: string;
  friendStatus: 'accepted' | 'pending_sent' | 'pending_received' | null;
  profilePictureUrl?: string | null;
}

export interface FriendRequest {
  _id: string;
  senderId?: string;
  senderName?: string;
  senderProfilePictureUrl?: string | null;
  receiverId?: string;
  receiverName?: string;
  receiverProfilePictureUrl?: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface Friend {
  id: string;
  name?: string;
  profilePictureUrl?: string | null;
}

export const friendService = {
  searchUsers: async (query: string): Promise<{ users: UserSearchResult[] }> => {
    const response = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to search users');
    }

    return response.json();
  },

  sendRequest: async (receiverId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/friends/request`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ receiverId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to send friend request');
    }

    return data;
  },

  getIncomingRequests: async (): Promise<{ requests: FriendRequest[] }> => {
    const response = await fetch(`${API_BASE}/friends/requests`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch friend requests');
    }

    return response.json();
  },

  getSentRequests: async (): Promise<{ requests: FriendRequest[] }> => {
    const response = await fetch(`${API_BASE}/friends/requests/sent`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch sent requests');
    }

    return response.json();
  },

  acceptRequest: async (requestId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/friends/request/${requestId}/accept`, {
      method: 'PUT',
      headers: authHeaders(),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to accept request');
    }

    return data;
  },

  rejectRequest: async (requestId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/friends/request/${requestId}/reject`, {
      method: 'PUT',
      headers: authHeaders(),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to reject request');
    }

    return data;
  },

  getFriends: async (): Promise<{ friends: Friend[] }> => {
    const response = await fetch(`${API_BASE}/friends`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch friends');
    }

    return response.json();
  },

  removeFriend: async (friendId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/friends/${friendId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to remove friend');
    }

    return data;
  },
};

// ===== Profile Service =====

export const profileService = {
  getMe: async (): Promise<{ id: string; email: string; name?: string; profilePictureUrl?: string | null }> => {
    const response = await fetch(`${API_BASE}/me`, {
      headers: authHeaders(),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to get profile');
    }
    return data;
  },

  uploadPicture: async (base64: string): Promise<{ message: string; profilePictureUrl: string }> => {
    const response = await fetch(`${API_BASE}/profile/picture`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ base64 }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to upload profile picture');
    }

    return data;
  },
};
