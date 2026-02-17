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

export interface Trip {
  _id: string;
  gpsPoints: GpsPoint[];
  photoKeys: string[];
  totalPhotoSize: number;
  photoCount: number;
  totalPoints: number;
  timestamp: string;
  createdAt: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  title: string;
  description: string;
  userProfilePictureUrl?: string;
}

export interface GetTripsResponse {
  datasets: Trip[];
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

export type FeedVisibility = 'public' | 'friends';

export const getVisibility = (): FeedVisibility => {
  return (localStorage.getItem('feedVisibility') as FeedVisibility) || 'public';
};

export const setVisibility = (v: FeedVisibility) => {
  localStorage.setItem('feedVisibility', v);
};

export const tripService = {
  getAllTrips: async (): Promise<GetTripsResponse> => {
    const visibility = getVisibility();
    const response = await fetch(`${API_BASE}/trips?visibility=${visibility}`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch trips');
    }

    return response.json();
  },

  getTripPoints: async (tripId: string): Promise<{ gpsPoints: GpsPoint[] }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/points`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch trip GPS points');
    }

    return response.json();
  },

  getTripPhotos: async (tripId: string): Promise<{ photos: Photo[] }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/photos`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
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
};

// ===== Friends System =====

export interface UserSearchResult {
  _id: string;
  name?: string;
  email: string;
  friendStatus: 'accepted' | 'pending_sent' | 'pending_received' | null;
  profilePictureUrl?: string | null;
}

export interface FriendRequest {
  _id: string;
  senderId: string;
  senderName?: string;
  senderEmail: string;
  senderProfilePictureUrl?: string | null;
  receiverId: string;
  receiverName?: string;
  receiverEmail: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface Friend {
  id: string;
  name?: string;
  email: string;
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
